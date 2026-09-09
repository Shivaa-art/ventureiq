// =====================================================================
// gapDetector (Phase 4, Step 9).
//
// Fully deterministic — no LLM call. Distinguishes NO_EVIDENCE from
// INSUFFICIENT_EVIDENCE from LOW_QUALITY_EVIDENCE from
// CONTRADICTORY_EVIDENCE per requirement, with severity driven by the
// hypothesis's and requirement's own importance (never a flat
// default) — see severity.ts.
//
// Core principle enforced here: absence of evidence is never treated
// as negative evidence. A requirement with zero evidence produces a
// NO_EVIDENCE gap, not a "this hypothesis looks bad" signal — gaps and
// contradicting evidence are structurally different things.
// =====================================================================

import type { Evidence, EvidenceRequirement, Hypothesis } from "@/lib/types/domain";
import type { DetectedGapSchema } from "@/lib/types/schemas";
import type { z } from "zod";
import { severityFromImportance } from "@/backend/evidence/severity";

type DetectedGap = z.infer<typeof DetectedGapSchema>;

/** Minimum real/user-provided evidence item counts to satisfy each declared minimum evidence level. */
const MIN_ITEMS_BY_LEVEL: Record<EvidenceRequirement["minimumEvidenceLevel"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 3,
};

/** Below this average reliability, evidence exists but is treated as low quality rather than sufficient. */
const LOW_QUALITY_RELIABILITY_THRESHOLD = 40;

function isCountedEvidence(e: Evidence): boolean {
  // Demo/mock evidence never counts toward real coverage or gap
  // resolution — it exists to illustrate the UI, not to be mistaken
  // for research. "unavailable" data_status likewise contributes
  // nothing (it exists to record "we tried and couldn't get anything").
  // Phase 6: externally-researched evidence additionally must have
  // cleared human review (reviewStatus "accepted") before it counts —
  // a retrieved-but-not-yet-reviewed source is not yet trusted.
  return (
    (e.dataStatus === "real" || e.dataStatus === "user_provided") && e.reviewStatus === "accepted"
  );
}

export function detectGaps(
  hypothesis: Hypothesis,
  requirements: EvidenceRequirement[],
  evidence: Evidence[],
): DetectedGap[] {
  const gaps: DetectedGap[] = [];

  for (const requirement of requirements) {
    const linkedEvidence = evidence.filter(
      (e) => e.evidenceRequirementId === requirement.id && isCountedEvidence(e),
    );
    const severity = severityFromImportance(hypothesis.importance, requirement.importance);

    if (linkedEvidence.length === 0) {
      gaps.push({
        hypothesisId: hypothesis.id,
        evidenceRequirementId: requirement.id,
        gapType: "no_evidence",
        severity,
        missingRequirement: requirement.description,
        importance: requirement.importance,
        businessImpact: businessImpactText(requirement, "no_evidence"),
        recommendedValidation: requirement.description,
      });
      continue;
    }

    const minRequired = MIN_ITEMS_BY_LEVEL[requirement.minimumEvidenceLevel];
    const supporting = linkedEvidence.filter((e) => e.supportDirection === "supports");
    const contradicting = linkedEvidence.filter((e) => e.supportDirection === "contradicts");

    if (supporting.length > 0 && contradicting.length > 0) {
      gaps.push({
        hypothesisId: hypothesis.id,
        evidenceRequirementId: requirement.id,
        gapType: "contradictory_evidence",
        severity,
        missingRequirement: requirement.description,
        importance: requirement.importance,
        businessImpact: businessImpactText(requirement, "contradictory_evidence"),
        recommendedValidation: `Resolve the conflicting evidence for "${requirement.evidenceType}" with a more decisive source (e.g. a direct experiment) before treating this requirement as met.`,
      });
      continue;
    }

    if (linkedEvidence.length < minRequired) {
      gaps.push({
        hypothesisId: hypothesis.id,
        evidenceRequirementId: requirement.id,
        gapType: "insufficient_evidence",
        severity,
        missingRequirement: requirement.description,
        importance: requirement.importance,
        businessImpact: businessImpactText(requirement, "insufficient_evidence"),
        recommendedValidation: `Gather at least ${minRequired} independent item(s) of evidence for "${requirement.evidenceType}" (currently ${linkedEvidence.length}).`,
      });
      continue;
    }

    const avgReliability =
      linkedEvidence.reduce((sum, e) => sum + e.reliabilityScore, 0) / linkedEvidence.length;
    if (avgReliability < LOW_QUALITY_RELIABILITY_THRESHOLD) {
      gaps.push({
        hypothesisId: hypothesis.id,
        evidenceRequirementId: requirement.id,
        gapType: "low_quality_evidence",
        severity,
        missingRequirement: requirement.description,
        importance: requirement.importance,
        businessImpact: businessImpactText(requirement, "low_quality_evidence"),
        recommendedValidation: `Existing evidence for "${requirement.evidenceType}" is low-reliability; seek a more authoritative source.`,
      });
    }
  }

  return gaps;
}

function businessImpactText(
  requirement: EvidenceRequirement,
  gapType: DetectedGap["gapType"],
): string {
  switch (gapType) {
    case "no_evidence":
      return `No evidence has been collected for "${requirement.evidenceType}" (${requirement.importance} importance). This requirement cannot yet inform the hypothesis's validity either way.`;
    case "insufficient_evidence":
      return `Some evidence exists for "${requirement.evidenceType}" but not enough to meet the declared minimum evidence level.`;
    case "low_quality_evidence":
      return `Evidence for "${requirement.evidenceType}" exists but comes from low-reliability sources, limiting how much it should move the hypothesis's assessment.`;
    case "contradictory_evidence":
      return `Evidence for "${requirement.evidenceType}" points in both directions, so this requirement cannot be treated as cleanly met.`;
    default:
      return "";
  }
}
