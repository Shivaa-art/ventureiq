// =====================================================================
// ValidationPlanService — orchestrates Phase 3's pipeline:
//
//   Raw Business Idea -> Idea Structuring -> Assumption Extraction
//     -> Hypothesis Generation -> Evidence Requirement Generation
//     -> (human review + edit) -> Approve Validation Plan
//
// Each stage is a separate service (idea-structuring, assumption-
// extraction, hypothesis-generation, evidence-requirement) — this file
// only sequences them and persists their output, one stage at a time,
// updating the corresponding status column as it goes so the analysis
// screen reflects real backend state. If a stage fails, the run stops
// there (earlier stages' data stays persisted) and the error is
// surfaced rather than papered over with fabricated data.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  BusinessAssumption,
  Hypothesis,
  RawBusinessIdeaInput,
  UUID,
} from "@/lib/types/domain";
import { BusinessIdeaRepository } from "@/backend/repositories/business-idea.repository";
import { AssumptionRepository } from "@/backend/repositories/assumption.repository";
import {
  HypothesisRepository,
  type HypothesisInsertInput,
} from "@/backend/repositories/hypothesis.repository";
import { EvidenceRepository } from "@/backend/repositories/evidence.repository";
import { StructuredGenerationError } from "@/backend/ai/client";
import { parseIdea } from "@/backend/services/idea-structuring.service";
import { extractAssumptions } from "@/backend/services/assumption-extraction.service";
import { generateHypotheses } from "@/backend/services/hypothesis-generation.service";
import { generateEvidenceRequirements } from "@/backend/services/evidence-requirement.service";

export interface PipelineStageResult {
  stage:
    | "idea_structuring"
    | "assumption_extraction"
    | "hypothesis_generation"
    | "evidence_requirement_generation";
  status: "completed" | "failed";
  error?: string;
}

export interface PipelineRunSummary {
  businessIdeaId: UUID;
  stages: PipelineStageResult[];
  stoppedEarly: boolean;
}

export class ValidationPlanService {
  private readonly businessIdeas: BusinessIdeaRepository;
  private readonly assumptions: AssumptionRepository;
  private readonly hypotheses: HypothesisRepository;
  private readonly evidence: EvidenceRepository;

  constructor(db: SupabaseClient<Database>) {
    this.businessIdeas = new BusinessIdeaRepository(db);
    this.assumptions = new AssumptionRepository(db);
    this.hypotheses = new HypothesisRepository(db);
    this.evidence = new EvidenceRepository(db);
  }

  /**
   * Runs idea structuring -> assumption extraction -> hypothesis
   * generation -> evidence requirement generation in sequence for a
   * business idea, persisting after every stage. Safe to call again on
   * a partially-completed or failed run: each stage only re-runs the
   * work it's responsible for (later phases may add smarter
   * resumption; for now a retry re-generates from the current
   * structured idea rather than replaying already-successful stages
   * verbatim, since founder-visible content — e.g. approved edits —
   * is not yet in play before Step 8 approval).
   */
  async runPipeline(businessIdeaId: UUID): Promise<PipelineRunSummary> {
    const stages: PipelineStageResult[] = [];
    const businessIdea = await this.businessIdeas.getById(businessIdeaId);
    if (!businessIdea) {
      throw new Error(`Business idea ${businessIdeaId} not found.`);
    }

    // --- Stage 1: Idea Structuring ---------------------------------------
    await this.businessIdeas.setStructuringStatus(businessIdeaId, "processing");
    let structured;
    try {
      const result = await parseIdea(businessIdea.raw);
      const saved = await this.businessIdeas.saveStructured(
        businessIdeaId,
        result.structured,
        result.model,
      );
      structured = saved.structured!;
      stages.push({ stage: "idea_structuring", status: "completed" });
    } catch (err) {
      const message = describeError(err);
      await this.businessIdeas.setStructuringStatus(businessIdeaId, "failed", message);
      stages.push({ stage: "idea_structuring", status: "failed", error: message });
      return { businessIdeaId, stages, stoppedEarly: true };
    }

    // --- Stage 2: Assumption Extraction -----------------------------------
    await this.businessIdeas.setAssumptionsStatus(businessIdeaId, "processing");
    let activeAssumptions: BusinessAssumption[];
    try {
      const result = await extractAssumptions(structured);
      activeAssumptions = await this.assumptions.createMany(
        businessIdeaId,
        result.assumptions.map((a) => ({
          statement: a.statement,
          category: a.category,
          importance: a.importance as BusinessAssumption["importance"],
          source: a.source,
        })),
      );
      await this.businessIdeas.setAssumptionsStatus(businessIdeaId, "completed");
      stages.push({ stage: "assumption_extraction", status: "completed" });
    } catch (err) {
      const message = describeError(err);
      await this.businessIdeas.setAssumptionsStatus(businessIdeaId, "failed", message);
      stages.push({ stage: "assumption_extraction", status: "failed", error: message });
      return { businessIdeaId, stages, stoppedEarly: true };
    }

    // --- Stage 3: Hypothesis Generation ------------------------------------
    await this.businessIdeas.setHypothesesStatus(businessIdeaId, "processing");
    let createdHypotheses: Hypothesis[];
    try {
      const result = await generateHypotheses(structured, activeAssumptions);
      const insertInputs: HypothesisInsertInput[] = result.hypotheses.map((h) => ({
        statement: h.statement,
        category: h.category as Hypothesis["category"],
        importance: h.importance as Hypothesis["importance"],
        validationCriteria: h.validationCriteria,
        threshold: h.threshold ?? null,
        thresholdType: h.thresholdType ?? null,
        assumptionId:
          h.assumptionIndex != null && activeAssumptions[h.assumptionIndex]
            ? activeAssumptions[h.assumptionIndex].id
            : null,
      }));
      createdHypotheses = await this.hypotheses.createMany(businessIdeaId, insertInputs);
      await this.businessIdeas.setHypothesesStatus(businessIdeaId, "completed");
      stages.push({ stage: "hypothesis_generation", status: "completed" });
    } catch (err) {
      const message = describeError(err);
      await this.businessIdeas.setHypothesesStatus(businessIdeaId, "failed", message);
      stages.push({ stage: "hypothesis_generation", status: "failed", error: message });
      return { businessIdeaId, stages, stoppedEarly: true };
    }

    // --- Stage 4: Evidence Requirement Generation (per hypothesis) --------
    await this.businessIdeas.setEvidenceRequirementsStatus(businessIdeaId, "processing");
    try {
      for (const hypothesis of createdHypotheses) {
        const result = await generateEvidenceRequirements(structured, hypothesis);
        await this.evidence.createRequirements(
          hypothesis.id,
          result.requirements.map((r) => ({
            evidenceType: r.evidenceType,
            description: r.description,
            importance: r.importance as Hypothesis["importance"],
            minimumEvidenceLevel: r.minimumEvidenceLevel as "low" | "medium" | "high" | "critical",
            preferredSources: r.preferredSources,
          })),
        );
      }
      await this.businessIdeas.setEvidenceRequirementsStatus(businessIdeaId, "completed");
      stages.push({ stage: "evidence_requirement_generation", status: "completed" });
    } catch (err) {
      const message = describeError(err);
      await this.businessIdeas.setEvidenceRequirementsStatus(businessIdeaId, "failed", message);
      stages.push({ stage: "evidence_requirement_generation", status: "failed", error: message });
      return { businessIdeaId, stages, stoppedEarly: true };
    }

    return { businessIdeaId, stages, stoppedEarly: false };
  }

  async getPlan(businessIdeaId: UUID) {
    const businessIdea = await this.businessIdeas.getById(businessIdeaId);
    if (!businessIdea) throw new Error(`Business idea ${businessIdeaId} not found.`);

    const [assumptions, hypotheses] = await Promise.all([
      this.assumptions.listByBusinessIdea(businessIdeaId),
      this.hypotheses.listByBusinessIdea(businessIdeaId),
    ]);
    const requirementsByHypothesis = await this.evidence.listRequirementsByHypotheses(
      hypotheses.map((h) => h.id),
    );

    return { businessIdea, assumptions, hypotheses, requirementsByHypothesis };
  }

  async approvePlan(businessIdeaId: UUID) {
    return this.businessIdeas.setPlanStatus(businessIdeaId, "approved");
  }
}

function describeError(err: unknown): string {
  if (err instanceof StructuredGenerationError) return err.message;
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
}

export type { RawBusinessIdeaInput };
