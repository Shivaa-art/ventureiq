// =====================================================================
// Project-level confidence (Phase 5, Step 5).
//
// Fully deterministic — no LLM call, no simple average. Weights each
// hypothesis's confidence by its own importance so a critical
// hypothesis dominates the overall figure far more than a low-
// importance one, and separately reports the average confidence across
// only "critical" hypotheses plus which one of those is weakest.
// =====================================================================

import type {
  ConfidenceScore,
  EvidenceCoverage,
  Hypothesis,
  Importance,
  ProjectConfidenceSummary,
} from "@/lib/types/domain";

export const PROJECT_CONFIDENCE_FORMULA_VERSION = "project-confidence-v1";

const IMPORTANCE_WEIGHT: Record<Importance, number> = { low: 1, medium: 2, high: 3, critical: 5 };

export function computeProjectConfidence(
  hypotheses: Hypothesis[],
  confidenceByHypothesis: Record<string, ConfidenceScore | undefined>,
  coverageByHypothesis: Record<string, EvidenceCoverage | undefined>,
): ProjectConfidenceSummary {
  if (hypotheses.length === 0) {
    return {
      overallConfidence: 0,
      criticalHypothesisConfidence: null,
      evidenceCoveragePct: 0,
      weakestCriticalHypothesisId: null,
      formulaVersion: PROJECT_CONFIDENCE_FORMULA_VERSION,
    };
  }

  let weightedConfidenceSum = 0;
  let weightedCoverageSum = 0;
  let weightSum = 0;

  const critical = hypotheses.filter((h) => h.importance === "critical");
  let weakestCriticalId: string | null = null;
  let weakestCriticalScore = Infinity;
  let criticalConfidenceSum = 0;

  for (const h of hypotheses) {
    const confidence = confidenceByHypothesis[h.id]?.finalConfidence ?? 0;
    const coverage = coverageByHypothesis[h.id]?.coveragePct ?? 0;
    const weight = IMPORTANCE_WEIGHT[h.importance];

    weightedConfidenceSum += confidence * weight;
    weightedCoverageSum += coverage * weight;
    weightSum += weight;

    if (h.importance === "critical") {
      criticalConfidenceSum += confidence;
      if (confidence < weakestCriticalScore) {
        weakestCriticalScore = confidence;
        weakestCriticalId = h.id;
      }
    }
  }

  return {
    overallConfidence:
      weightSum === 0 ? 0 : Math.round((weightedConfidenceSum / weightSum) * 100) / 100,
    criticalHypothesisConfidence:
      critical.length === 0
        ? null
        : Math.round((criticalConfidenceSum / critical.length) * 100) / 100,
    evidenceCoveragePct:
      weightSum === 0 ? 0 : Math.round((weightedCoverageSum / weightSum) * 100) / 100,
    weakestCriticalHypothesisId: weakestCriticalId,
    formulaVersion: PROJECT_CONFIDENCE_FORMULA_VERSION,
  };
}
