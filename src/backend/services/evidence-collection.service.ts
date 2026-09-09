// =====================================================================
// EvidenceCollectionService — orchestrates Phase 4's evidence pipeline:
//
//   Raw content (provider or founder submission)
//     -> Classification (evidenceClassifier, or founder's own label)
//     -> Normalization (deterministic quality scores)
//     -> Persist evidence + evidence_relationships
//     -> Recalculate coverage / gaps / conflicts for the hypothesis
//
// This is the single place Step 13's six-step "Add Evidence" sequence
// is actually implemented, and also backs Step 14's "Re-evaluate
// Evidence" (retrieve existing evidence, reclassify, recalculate —
// without duplicating evidence records).
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { Evidence, EvidenceCoverage, Hypothesis, UUID } from "@/lib/types/domain";
import { EvidenceRepository } from "@/backend/repositories/evidence.repository";
import { HypothesisRepository } from "@/backend/repositories/hypothesis.repository";
import { ConflictGapRepository } from "@/backend/repositories/conflict-gap.repository";
import { DemoEvidenceProvider } from "@/backend/evidence/providers/demo-provider";
import {
  UserEvidenceProvider,
  type UserEvidenceSubmission,
} from "@/backend/evidence/providers/user-provider";
import type { RawEvidenceContent } from "@/backend/evidence/provider";
import { normalizeEvidence } from "@/backend/services/evidence-normalization.service";
import { classifyEvidence } from "@/backend/services/evidence-classification.service";
import { detectGaps } from "@/backend/services/evidence-gap.service";
import { detectConflicts } from "@/backend/services/evidence-conflict.service";
import { StructuredGenerationError } from "@/backend/ai/client";

export interface EvidenceWorkspace {
  hypothesis: Hypothesis;
  evidence: Evidence[];
  coverage: EvidenceCoverage;
  gaps: Awaited<ReturnType<ConflictGapRepository["listGapsByHypothesis"]>>;
  conflicts: Awaited<ReturnType<ConflictGapRepository["listConflictsByHypothesis"]>>;
}

export class EvidenceCollectionService {
  private readonly evidence: EvidenceRepository;
  private readonly hypotheses: HypothesisRepository;
  private readonly conflictsGaps: ConflictGapRepository;
  private readonly userProvider = new UserEvidenceProvider();
  private readonly demoProvider = new DemoEvidenceProvider();

  constructor(db: SupabaseClient<Database>) {
    this.evidence = new EvidenceRepository(db);
    this.hypotheses = new HypothesisRepository(db);
    this.conflictsGaps = new ConflictGapRepository(db);
  }

  /**
   * Step 13's "Add Evidence" flow for a founder-submitted item. The
   * founder's own SUPPORTS/CONTRADICTS/NEUTRAL label is authoritative
   * — this never calls the LLM classifier. Ends with coverage/gaps/
   * conflicts recalculated for the hypothesis.
   */
  async addUserEvidence(input: UserEvidenceSubmission): Promise<EvidenceWorkspace> {
    const hypothesis = await this.requireHypothesis(input.hypothesisId);
    const { content, supportDirection, notes } = this.userProvider.submit(input);

    const draft = normalizeEvidence({
      content,
      supportDirection,
      // Do not automatically trust user-provided evidence (Phase 4,
      // Step 2): a fixed moderate confidence, not the maximum, reflects
      // "as asserted by the founder, not independently classified."
      classificationConfidence: 60,
      classificationReason: "Support direction set directly by the founder at submission time.",
      notes,
    });

    await this.persistAndLink(hypothesis, [draft]);
    return this.reevaluate(input.hypothesisId);
  }

  /**
   * Runs the demo provider against every open evidence requirement for
   * a hypothesis. Every item this produces carries dataStatus "demo"
   * and is run through the real classifier (same code path real
   * evidence would use) rather than a hardcoded label.
   */
  async collectDemoEvidence(hypothesisId: UUID): Promise<EvidenceWorkspace> {
    const hypothesis = await this.requireHypothesis(hypothesisId);
    const requirements = await this.evidence.listRequirementsByHypothesis(hypothesisId);

    if (!this.demoProvider.isAvailable()) {
      throw new Error("Demo evidence provider is not available.");
    }

    const drafts: ReturnType<typeof normalizeEvidence>[] = [];
    for (const requirement of requirements) {
      // Demo mode doesn't need the real structured business idea for
      // content generation — see DemoEvidenceProvider — so an empty
      // context idea is fine here.
      const rawItems = await this.demoProvider.collect({
        businessIdea: {} as never,
        requirement,
      });
      for (const raw of rawItems) {
        const classified = await this.classifyOrFallback(hypothesis, raw);
        drafts.push(
          normalizeEvidence({
            content: raw,
            supportDirection: classified.classification,
            classificationConfidence: classified.confidence,
            classificationReason: classified.reason,
          }),
        );
      }
    }

    await this.persistAndLink(hypothesis, drafts);
    return this.reevaluate(hypothesisId);
  }

  async updateEvidence(
    evidenceId: UUID,
    fields: Parameters<EvidenceRepository["updateEditableFields"]>[1],
  ): Promise<EvidenceWorkspace> {
    const existing = await this.evidence.getById(evidenceId);
    if (!existing) throw new Error(`Evidence ${evidenceId} not found.`);
    await this.evidence.updateEditableFields(evidenceId, fields);
    return this.reevaluate(existing.hypothesisId);
  }

  async deleteEvidence(evidenceId: UUID): Promise<EvidenceWorkspace> {
    const existing = await this.evidence.getById(evidenceId);
    if (!existing) throw new Error(`Evidence ${evidenceId} not found.`);
    await this.evidence.delete(evidenceId);
    return this.reevaluate(existing.hypothesisId);
  }

  /**
   * Step 14 — "Re-evaluate Evidence". Retrieves the hypothesis's
   * existing evidence (no new collection, no duplication), recomputes
   * coverage, and replaces the auto-generated open gaps/conflicts with
   * a fresh detection pass. Founder-reviewed gaps/conflicts (status
   * moved off "open", or not auto_generated) are left untouched.
   */
  async reevaluate(hypothesisId: UUID): Promise<EvidenceWorkspace> {
    const hypothesis = await this.requireHypothesis(hypothesisId);
    const [requirements, evidenceItems] = await Promise.all([
      this.evidence.listRequirementsByHypothesis(hypothesisId),
      this.evidence.listByHypothesis(hypothesisId),
    ]);

    const detectedGaps = detectGaps(hypothesis, requirements, evidenceItems);
    const detectedConflicts = detectConflicts(hypothesis, evidenceItems);

    await this.conflictsGaps.deleteAutoGeneratedOpenGaps(hypothesisId);
    await this.conflictsGaps.deleteAutoGeneratedOpenConflicts(hypothesisId);
    await this.conflictsGaps.createGaps(detectedGaps);
    await this.conflictsGaps.createConflicts(detectedConflicts);

    const [coverage, gaps, conflicts, refreshedEvidence] = await Promise.all([
      this.evidence.getCoverage(hypothesisId),
      this.conflictsGaps.listGapsByHypothesis(hypothesisId),
      this.conflictsGaps.listConflictsByHypothesis(hypothesisId),
      this.evidence.listByHypothesis(hypothesisId),
    ]);

    return { hypothesis, evidence: refreshedEvidence, coverage, gaps, conflicts };
  }

  async getWorkspace(hypothesisId: UUID): Promise<EvidenceWorkspace> {
    const hypothesis = await this.requireHypothesis(hypothesisId);
    const [evidenceItems, coverage, gaps, conflicts] = await Promise.all([
      this.evidence.listByHypothesis(hypothesisId),
      this.evidence.getCoverage(hypothesisId),
      this.conflictsGaps.listGapsByHypothesis(hypothesisId),
      this.conflictsGaps.listConflictsByHypothesis(hypothesisId),
    ]);
    return { hypothesis, evidence: evidenceItems, coverage, gaps, conflicts };
  }

  // -- internals -------------------------------------------------------------

  private async requireHypothesis(id: UUID): Promise<Hypothesis> {
    const hypothesis = await this.hypotheses.getById(id);
    if (!hypothesis) throw new Error(`Hypothesis ${id} not found.`);
    return hypothesis;
  }

  private async classifyOrFallback(
    hypothesis: Hypothesis,
    raw: RawEvidenceContent,
  ): Promise<{
    classification: "supports" | "contradicts" | "neutral";
    reason: string;
    confidence: number;
  }> {
    try {
      return await classifyEvidence(hypothesis, raw.summary, raw.source);
    } catch (err) {
      if (err instanceof StructuredGenerationError) {
        // Never fabricate a classification if the model call fails —
        // fall back to an explicitly-labeled neutral, low-confidence
        // result rather than guessing.
        return {
          classification: "neutral",
          reason: `Automatic classification failed (${err.message}); left as neutral pending manual review.`,
          confidence: 0,
        };
      }
      throw err;
    }
  }

  private async persistAndLink(
    hypothesis: Hypothesis,
    drafts: ReturnType<typeof normalizeEvidence>[],
  ): Promise<void> {
    if (drafts.length === 0) return;
    const created = await this.evidence.createEvidence(drafts);
    await this.evidence.createRelationships(
      created.map((e) => ({
        hypothesisId: hypothesis.id,
        evidenceId: e.id,
        relationshipType:
          e.supportDirection === "supports"
            ? "supports_hypothesis"
            : e.supportDirection === "contradicts"
              ? "contradicts_hypothesis"
              : "neutral_to_hypothesis",
        classificationConfidence: e.confidenceScore,
        reason: e.classificationReason,
      })),
    );
  }
}
