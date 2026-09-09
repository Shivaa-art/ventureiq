// =====================================================================
// Pipeline orchestration service.
//
// This file is the single place that encodes the end-to-end sequence:
//
//   Business Idea
//     -> Idea Structuring              (Phase 3 — idea-structuring.service.ts, IMPLEMENTED)
//     -> Assumption Extraction         (Phase 3 — assumption-extraction.service.ts, IMPLEMENTED)
//     -> Hypothesis Generation         (Phase 3 — hypothesis-generation.service.ts, IMPLEMENTED)
//     -> Evidence Requirement Generation (Phase 3 — evidence-requirement.service.ts, IMPLEMENTED)
//     -> Evidence Collection           (Phase 4 — evidence-collection.service.ts, IMPLEMENTED)
//     -> Evidence Normalization        (Phase 4 — evidence-normalization.service.ts, IMPLEMENTED)
//     -> Evidence Relationships        (Phase 4 — evidence-collection.service.ts, IMPLEMENTED)
//     -> Conflict Detection            (Phase 4 — evidence-conflict.service.ts, IMPLEMENTED)
//     -> Evidence Gap Detection        (Phase 4 — evidence-gap.service.ts, IMPLEMENTED)
//     -> Confidence Engine             (Phase 5 — confidence-engine.ts, deterministic)
//     -> Opportunity Score             (Phase 5 — opportunity-score.ts, deterministic)
//     -> Adaptive Validation Action    (Phase 5 — adaptive-engine.ts, deterministic ranking)
//     -> Human Decision                (later phase — validation.repository.recordDecision)
//
// Stage IDs here are the canonical names used across domain types,
// validation-plan.service.ts / evidence-*.service.ts, and the UI
// (src/routes/analysis.$id.tsx) — keep all four in sync when adding or
// renaming a stage.
//
// Each stage below is a documented extension point. Stages not yet
// wired to a live implementation throw explicitly rather than silently
// returning fabricated data, so an accidental early call fails loudly
// instead of producing a fake report.
// =====================================================================

export type PipelineStageId =
  | "idea_structuring"
  | "assumption_extraction"
  | "hypothesis_generation"
  | "evidence_requirement_generation"
  | "evidence_collection"
  | "evidence_normalization"
  | "evidence_relationships"
  | "conflict_detection"
  | "gap_detection"
  | "confidence_calculation"
  | "opportunity_scoring"
  | "validation_actions";

export type PipelineStageStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineStageState {
  id: PipelineStageId;
  label: string;
  status: PipelineStageStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export const PIPELINE_STAGES: Array<{ id: PipelineStageId; label: string }> = [
  { id: "idea_structuring", label: "Structuring business idea" },
  { id: "assumption_extraction", label: "Extracting assumptions" },
  { id: "hypothesis_generation", label: "Generating hypotheses" },
  { id: "evidence_requirement_generation", label: "Determining evidence requirements" },
  { id: "evidence_collection", label: "Collecting evidence" },
  { id: "evidence_normalization", label: "Normalizing evidence" },
  { id: "evidence_relationships", label: "Mapping evidence relationships" },
  { id: "conflict_detection", label: "Detecting conflicts" },
  { id: "gap_detection", label: "Detecting evidence gaps" },
  { id: "confidence_calculation", label: "Calculating confidence" },
  { id: "opportunity_scoring", label: "Calculating opportunity score" },
  { id: "validation_actions", label: "Generating validation actions" },
];

/**
 * Builds the initial (all-pending) stage list for a fresh analysis run.
 * The analysis screen renders exactly this list and updates it from
 * real persisted status — e.g. business_ideas.*_status columns,
 * presence of hypotheses/evidence/scores rows — never from a
 * client-side timer. No stage is ever shown "completed" before its
 * corresponding database write has actually happened.
 */
export function initPipelineState(): PipelineStageState[] {
  return PIPELINE_STAGES.map((s) => ({ id: s.id, label: s.label, status: "pending" as const }));
}

// -----------------------------------------------------------------------
// NOT YET IMPLEMENTED — placeholders for stages beyond Phase 4.
// Each throws explicitly rather than silently returning fabricated data,
// so any accidental early call fails loudly instead of producing a fake
// report.
// -----------------------------------------------------------------------

function notImplemented(stage: PipelineStageId): never {
  throw new Error(
    `Pipeline stage "${stage}" is not implemented yet (see AGENTS/architecture notes — ` +
      `scheduled for its corresponding phase). Refusing to fabricate a result.`,
  );
}

export const pipelineStagePlaceholders: Partial<Record<PipelineStageId, () => never>> = {
  confidence_calculation: () => notImplemented("confidence_calculation"),
  opportunity_scoring: () => notImplemented("opportunity_scoring"),
  validation_actions: () => notImplemented("validation_actions"),
};
