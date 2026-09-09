// =====================================================================
// ScoringService — orchestrates Phase 5's decision-support layer:
//
//   Evidence + Gaps + Conflicts
//     -> Hypothesis Confidence (confidence-engine.ts, deterministic)
//     -> Project-level Confidence (project-confidence.ts, deterministic)
//     -> Opportunity Score (opportunity-dimension-mapper.ts + opportunity-score.ts)
//     -> Critical Uncertainties (critical-uncertainty.ts)
//     -> Adaptive Validation Actions (validation-action-generator.ts + adaptive-engine.ts)
//
// recalculateAll() is the single entry point that runs this whole
// chain for a business idea — used after project approval, and again
// after every validation result (Phase 5, Step 15's adaptive loop).
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  CriticalUncertainty,
  Decision,
  ProjectConfidenceSummary,
  UUID,
} from "@/lib/types/domain";
import { HypothesisRepository } from "@/backend/repositories/hypothesis.repository";
import { EvidenceRepository } from "@/backend/repositories/evidence.repository";
import { ConflictGapRepository } from "@/backend/repositories/conflict-gap.repository";
import { ScoringRepository } from "@/backend/repositories/scoring.repository";
import { ValidationRepository } from "@/backend/repositories/validation.repository";
import { BusinessIdeaRepository } from "@/backend/repositories/business-idea.repository";
import {
  computeConfidenceScore,
  deriveHypothesisStatus,
} from "@/backend/scoring/confidence-engine";
import { computeProjectConfidence } from "@/backend/scoring/project-confidence";
import { buildOpportunityDimensions } from "@/backend/scoring/opportunity-dimension-mapper";
import { computeOpportunityScore } from "@/backend/scoring/opportunity-score";
import { identifyCriticalUncertainties } from "@/backend/scoring/critical-uncertainty";
import { generateCandidatesFromGaps } from "@/backend/validation/validation-action-generator";
import { rankValidationActions } from "@/backend/validation/adaptive-engine";
import { EvidenceCollectionService } from "@/backend/services/evidence-collection.service";
import {
  UserEvidenceProvider,
  type UserEvidenceSubmission,
} from "@/backend/evidence/providers/user-provider";
import { computeSourceFingerprint } from "@/backend/evidence/evidence-quality";

export interface ValidationResultInput {
  validationActionId: UUID;
  hypothesisId: UUID;
  outcome: "supports" | "contradicts" | "neutral";
  result: string; // short outcome label
  notes?: string | null;
  supportingData?: string | null; // e.g. a URL or reference to raw data
  date?: string | null;
}

export class ScoringService {
  private readonly hypotheses: HypothesisRepository;
  private readonly evidence: EvidenceRepository;
  private readonly conflictsGaps: ConflictGapRepository;
  private readonly scoring: ScoringRepository;
  private readonly validation: ValidationRepository;
  private readonly businessIdeas: BusinessIdeaRepository;
  private readonly evidenceCollection: EvidenceCollectionService;
  private readonly userProvider = new UserEvidenceProvider();

  constructor(private readonly db: SupabaseClient<Database>) {
    this.hypotheses = new HypothesisRepository(db);
    this.evidence = new EvidenceRepository(db);
    this.conflictsGaps = new ConflictGapRepository(db);
    this.scoring = new ScoringRepository(db);
    this.validation = new ValidationRepository(db);
    this.businessIdeas = new BusinessIdeaRepository(db);
    this.evidenceCollection = new EvidenceCollectionService(db);
  }

  /**
   * Computes and persists confidence for a single hypothesis, and
   * updates the hypothesis's status via the SAME deterministic mapping
   * — status is derived from confidence + evidence balance, never set
   * directly, and a high confidence never automatically implies
   * VALIDATED (Phase 5, Step 4).
   */
  async computeHypothesisConfidence(hypothesisId: UUID) {
    const hypothesis = await this.hypotheses.getById(hypothesisId);
    if (!hypothesis) throw new Error(`Hypothesis ${hypothesisId} not found.`);

    const [evidenceItems, coverage, gaps, conflicts] = await Promise.all([
      this.evidence.listByHypothesis(hypothesisId),
      this.evidence.getCoverage(hypothesisId),
      this.conflictsGaps.listGapsByHypothesis(hypothesisId),
      this.conflictsGaps.listConflictsByHypothesis(hypothesisId),
    ]);

    const scoreInput = computeConfidenceScore({
      hypothesisId,
      hypothesisImportance: hypothesis.importance,
      evidence: evidenceItems,
      evidenceCoveragePct: coverage.coveragePct,
      openGaps: gaps.filter((g) => g.status === "open"),
      openConflicts: conflicts.filter((c) => c.status === "open"),
    });

    const saved = await this.scoring.saveConfidenceScore(scoreInput);
    const status = deriveHypothesisStatus(scoreInput);
    await this.hypotheses.updateStatusAndConfidence(hypothesisId, status, saved.finalConfidence);

    return saved;
  }

  async computeAllHypothesesConfidence(businessIdeaId: UUID) {
    const hypotheses = await this.hypotheses.listByBusinessIdea(businessIdeaId);
    const scores = [];
    for (const h of hypotheses) {
      scores.push(await this.computeHypothesisConfidence(h.id));
    }
    return scores;
  }

  async computeProjectConfidenceSummary(businessIdeaId: UUID): Promise<ProjectConfidenceSummary> {
    const hypotheses = await this.hypotheses.listByBusinessIdea(businessIdeaId);
    const confidenceScores = await this.scoring.listLatestConfidenceScores(
      hypotheses.map((h) => h.id),
    );
    const confidenceByHypothesis = Object.fromEntries(
      confidenceScores.map((c) => [c.hypothesisId, c]),
    );

    const coverageByHypothesis: Record<
      string,
      Awaited<ReturnType<typeof this.evidence.getCoverage>>
    > = {};
    for (const h of hypotheses) {
      coverageByHypothesis[h.id] = await this.evidence.getCoverage(h.id);
    }

    return computeProjectConfidence(hypotheses, confidenceByHypothesis, coverageByHypothesis);
  }

  async computeAndSaveOpportunityScore(businessIdeaId: UUID) {
    const hypotheses = await this.hypotheses.listByBusinessIdea(businessIdeaId);
    const confidenceScores = await this.scoring.listLatestConfidenceScores(
      hypotheses.map((h) => h.id),
    );
    const confidenceByHypothesis = Object.fromEntries(
      confidenceScores.map((c) => [c.hypothesisId, c]),
    );
    const evidenceByHypothesis = await this.evidence.listByHypotheses(hypotheses.map((h) => h.id));

    const dimensions = buildOpportunityDimensions({
      hypotheses,
      confidenceByHypothesis,
      evidenceByHypothesis,
    });
    const scoreInput = computeOpportunityScore({ businessIdeaId, dimensions });
    return this.scoring.saveOpportunityScore(scoreInput);
  }

  async getCriticalUncertainties(businessIdeaId: UUID): Promise<CriticalUncertainty[]> {
    const hypotheses = await this.hypotheses.listByBusinessIdea(businessIdeaId);
    const confidenceScores = await this.scoring.listLatestConfidenceScores(
      hypotheses.map((h) => h.id),
    );
    const confidenceByHypothesis = Object.fromEntries(
      confidenceScores.map((c) => [c.hypothesisId, c]),
    );

    const coverageByHypothesis: Record<
      string,
      Awaited<ReturnType<typeof this.evidence.getCoverage>>
    > = {};
    const openConflictsByHypothesis: Record<
      string,
      Awaited<ReturnType<typeof this.conflictsGaps.listConflictsByHypothesis>>
    > = {};
    for (const h of hypotheses) {
      coverageByHypothesis[h.id] = await this.evidence.getCoverage(h.id);
      const conflicts = await this.conflictsGaps.listConflictsByHypothesis(h.id);
      openConflictsByHypothesis[h.id] = conflicts.filter((c) => c.status === "open");
    }

    return identifyCriticalUncertainties({
      hypotheses,
      confidenceByHypothesis,
      coverageByHypothesis,
      openConflictsByHypothesis,
    });
  }

  async generateValidationActions(businessIdeaId: UUID) {
    const hypotheses = await this.hypotheses.listByBusinessIdea(businessIdeaId);
    const confidenceScores = await this.scoring.listLatestConfidenceScores(
      hypotheses.map((h) => h.id),
    );
    const confidenceByHypothesis = Object.fromEntries(
      confidenceScores.map((c) => [c.hypothesisId, c]),
    );

    const gapsByHypothesis: Record<
      string,
      Awaited<ReturnType<typeof this.conflictsGaps.listGapsByHypothesis>>
    > = {};
    for (const h of hypotheses) {
      gapsByHypothesis[h.id] = await this.conflictsGaps.listGapsByHypothesis(h.id);
    }

    const candidates = generateCandidatesFromGaps(
      businessIdeaId,
      hypotheses,
      gapsByHypothesis,
      confidenceByHypothesis,
    );
    const ranked = rankValidationActions(candidates);

    // Idempotent: clear not-yet-acted-on recommendations before writing
    // the fresh ranked set, same pattern as gap/conflict re-evaluation.
    await this.validation.deleteRecommendedByBusinessIdea(businessIdeaId);
    return this.validation.createActions(ranked);
  }

  /** Runs the full confidence -> opportunity -> validation-action chain for a business idea. */
  async recalculateAll(businessIdeaId: UUID) {
    await this.computeAllHypothesesConfidence(businessIdeaId);
    const opportunityScore = await this.computeAndSaveOpportunityScore(businessIdeaId);
    const projectConfidence = await this.computeProjectConfidenceSummary(businessIdeaId);
    const criticalUncertainties = await this.getCriticalUncertainties(businessIdeaId);
    const validationActions = await this.generateValidationActions(businessIdeaId);

    return { opportunityScore, projectConfidence, criticalUncertainties, validationActions };
  }

  /**
   * Phase 5, Step 15's adaptive loop: record what happened when a
   * validation action was carried out, turn it into real evidence
   * (tagged user_provided, never auto-trusted), link it to the target
   * hypothesis, and re-run the full recalculation chain.
   */
  async recordValidationResult(input: ValidationResultInput) {
    const action = await this.validation.getById(input.validationActionId);
    if (!action) throw new Error(`Validation action ${input.validationActionId} not found.`);

    const submission: UserEvidenceSubmission = {
      hypothesisId: input.hypothesisId,
      evidenceRequirementId: null,
      title: `Validation result: ${action.actionTitle}`,
      description: input.result,
      source: `Validation action: ${action.method}`,
      sourceUrl: input.supportingData && isUrl(input.supportingData) ? input.supportingData : null,
      evidenceType: "experiment",
      publicationDate: input.date ?? null,
      notes: input.notes ?? null,
      supportDirection: input.outcome,
    };

    const { content, supportDirection } = this.userProvider.submit(submission);
    const fingerprint = computeSourceFingerprint({
      sourceUrl: content.sourceUrl,
      source: content.source,
    });

    // addUserEvidence already runs the evidence-layer recalculation
    // (coverage/gaps/conflicts) as part of Phase 4's pipeline; we only
    // need to additionally persist the fingerprint and then continue
    // the loop with confidence/opportunity/next-action.
    const workspace = await this.evidenceCollection.addUserEvidence(submission);
    // TODO(tech debt): this content-based match is a heuristic stand-in
    // for a proper returned evidence ID. Replace with the evidence ID
    // returned directly by EvidenceCollectionService.addUserEvidence /
    // EvidenceRepository.createEvidence once that method's return shape
    // is extended to surface the newly-created row(s) explicitly, rather
    // than matching by title+summary+direction after the fact.
    const newEvidence = workspace.evidence.find(
      (e) =>
        e.sourceTitle === content.sourceTitle &&
        e.summary === content.summary &&
        e.supportDirection === supportDirection,
    );
    if (newEvidence) {
      await this.db
        .from("evidence")
        .update({ source_fingerprint: fingerprint })
        .eq("id", newEvidence.id);
    }

    await this.validation.recordResult(
      input.validationActionId,
      input.result,
      newEvidence ? [newEvidence.id] : [],
      [input.hypothesisId],
    );

    const hypothesis = await this.hypotheses.getById(input.hypothesisId);
    if (!hypothesis) throw new Error("Hypothesis not found after recording result.");

    return this.recalculateAll(hypothesis.businessIdeaId);
  }

  async recordDecision(
    businessIdeaId: UUID,
    userId: UUID,
    decision: Decision,
    notes?: string,
    basis?: string,
  ) {
    return this.validation.recordDecision(businessIdeaId, userId, decision, notes, basis);
  }
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
