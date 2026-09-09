// =====================================================================
// Derived project status (Phase 7, Step 1 & 15).
//
// PRINCIPLE: status is computed from existing pipeline/plan/evidence/
// decision state at read time — never stored as its own mutable field.
// This guarantees the status shown can never drift from the data that
// actually defines it (no dual-write bugs, no "status says X but the
// underlying pipeline says Y").
// =====================================================================

import type {
  BusinessIdea,
  DerivedProjectStatus,
  Evidence,
  UserDecision,
} from "@/lib/types/domain";

export interface DeriveStatusInput {
  businessIdea: BusinessIdea;
  hypothesisCount: number;
  hasConfidenceScores: boolean;
  evidence: Evidence[];
  decision: UserDecision | null;
}

export function deriveProjectStatus(input: DeriveStatusInput): DerivedProjectStatus {
  const { businessIdea, hypothesisCount, hasConfidenceScores, evidence, decision } = input;

  if (decision) return "completed";

  const anyStageFailed =
    businessIdea.structuringStatus === "failed" ||
    businessIdea.assumptionsStatus === "failed" ||
    businessIdea.hypothesesStatus === "failed" ||
    businessIdea.evidenceRequirementsStatus === "failed";
  if (anyStageFailed && businessIdea.planStatus !== "approved") return "failed";

  if (businessIdea.planStatus !== "approved") {
    return hypothesisCount > 0 ? "validation_plan" : "draft";
  }

  // Plan is approved from here on.
  const realEvidenceCount = evidence.filter(
    (e) => e.dataStatus === "real" || e.dataStatus === "user_provided",
  ).length;
  const pendingReviewCount = evidence.filter((e) => e.reviewStatus === "pending_review").length;

  if (realEvidenceCount === 0) return "researching";
  if (pendingReviewCount > 0) return "review";
  if (hasConfidenceScores) return "ready_for_decision";
  return "researching";
}

export const DERIVED_STATUS_LABELS: Record<DerivedProjectStatus, string> = {
  draft: "Draft",
  validation_plan: "Validation plan",
  researching: "Researching",
  review: "Review",
  ready_for_decision: "Ready for decision",
  completed: "Completed",
  failed: "Failed",
};
