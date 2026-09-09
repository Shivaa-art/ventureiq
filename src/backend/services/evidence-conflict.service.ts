// =====================================================================
// conflictDetector (Phase 4, Step 10).
//
// Fully deterministic — no LLM call. A conflict exists when a
// hypothesis has BOTH meaningful supporting AND meaningful
// contradicting evidence (each side represented by at least one item
// whose classification confidence clears a "not-trivial" bar). The two
// sides are never averaged away — both evidence ID lists are stored
// so the founder can see exactly what disagrees.
// =====================================================================

import type { Evidence, Hypothesis } from "@/lib/types/domain";
import type { DetectedConflictSchema } from "@/lib/types/schemas";
import type { z } from "zod";
import { severityFromImportance } from "@/backend/evidence/severity";

type DetectedConflict = z.infer<typeof DetectedConflictSchema>;

/** Below this classification confidence, a single contradicting/supporting item is too weak to count as a real conflicting side. */
const MEANINGFUL_CONFIDENCE_THRESHOLD = 40;

function isCountedEvidence(e: Evidence): boolean {
  // Phase 6: externally-researched evidence must have cleared human
  // review (reviewStatus "accepted") before it can contribute to
  // conflict detection — a pending-review source is not yet trusted.
  return (
    (e.dataStatus === "real" || e.dataStatus === "user_provided") && e.reviewStatus === "accepted"
  );
}

export function detectConflicts(hypothesis: Hypothesis, evidence: Evidence[]): DetectedConflict[] {
  const counted = evidence.filter(isCountedEvidence);

  const meaningfulSupporting = counted.filter(
    (e) =>
      e.supportDirection === "supports" && e.confidenceScore >= MEANINGFUL_CONFIDENCE_THRESHOLD,
  );
  const meaningfulContradicting = counted.filter(
    (e) =>
      e.supportDirection === "contradicts" && e.confidenceScore >= MEANINGFUL_CONFIDENCE_THRESHOLD,
  );

  if (meaningfulSupporting.length === 0 || meaningfulContradicting.length === 0) {
    return [];
  }

  const avgSupportReliability = average(meaningfulSupporting.map((e) => e.reliabilityScore));
  const avgContradictReliability = average(meaningfulContradicting.map((e) => e.reliabilityScore));
  const strongestSide = Math.max(avgSupportReliability, avgContradictReliability);

  // Severity scales with the hypothesis's own importance, but a
  // conflict backed by only weak sources on both sides is downgraded
  // relative to one where at least one side is genuinely reliable.
  let severity = severityFromImportance(hypothesis.importance);
  if (strongestSide < 50 && severity !== "low") {
    severity = downgrade(severity);
  }

  return [
    {
      hypothesisId: hypothesis.id,
      conflictType: "direct_contradiction",
      severity,
      description:
        `${meaningfulSupporting.length} item(s) of evidence support this hypothesis while ` +
        `${meaningfulContradicting.length} item(s) contradict it. These are not averaged — both sides are ` +
        `preserved for review.`,
      supportingEvidenceIds: meaningfulSupporting.map((e) => e.id),
      contradictingEvidenceIds: meaningfulContradicting.map((e) => e.id),
    },
  ];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function downgrade(severity: "medium" | "high" | "critical"): "low" | "medium" | "high" {
  if (severity === "critical") return "high";
  if (severity === "high") return "medium";
  return "low";
}
