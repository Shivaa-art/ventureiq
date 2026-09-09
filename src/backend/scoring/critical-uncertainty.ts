// =====================================================================
// Critical uncertainty identification (Phase 5, Step 10).
//
// Fully deterministic — no LLM call. Ranks hypotheses by an
// "uncertainty urgency" score combining importance, low confidence,
// low evidence coverage, and open-conflict severity, and returns them
// in descending order — the first entry is THE critical uncertainty.
// =====================================================================

import type {
  ConfidenceScore,
  CriticalUncertainty,
  EvidenceConflict,
  EvidenceCoverage,
  Hypothesis,
  Importance,
} from "@/lib/types/domain";

export const CRITICAL_UNCERTAINTY_FORMULA_VERSION = "critical-uncertainty-v1";

const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};
const SEVERITY_WEIGHT: Record<EvidenceConflict["severity"], number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

export interface IdentifyCriticalUncertaintiesInput {
  hypotheses: Hypothesis[];
  confidenceByHypothesis: Record<string, ConfidenceScore | undefined>;
  coverageByHypothesis: Record<string, EvidenceCoverage | undefined>;
  openConflictsByHypothesis: Record<string, EvidenceConflict[]>;
}

export function identifyCriticalUncertainties(
  input: IdentifyCriticalUncertaintiesInput,
): CriticalUncertainty[] {
  const results = input.hypotheses.map((h) => {
    const confidence = input.confidenceByHypothesis[h.id];
    const coverage = input.coverageByHypothesis[h.id];
    const conflicts = input.openConflictsByHypothesis[h.id] ?? [];

    const finalConfidence = confidence?.finalConfidence ?? 0;
    const coveragePct = coverage?.coveragePct ?? 0;
    const maxConflictSeverity =
      conflicts.length > 0 ? Math.max(...conflicts.map((c) => SEVERITY_WEIGHT[c.severity])) : 0;

    // Business impact term: importance weighted by how far confidence
    // and coverage still are from "settled" — a critical hypothesis
    // that's already well-evidenced is not an urgent uncertainty
    // anymore, regardless of its importance.
    const uncertaintyGap = (100 - finalConfidence) / 100;
    const coverageGap = (100 - coveragePct) / 100;

    const uncertaintyScore =
      100 *
      (IMPORTANCE_WEIGHT[h.importance] * 0.4 +
        uncertaintyGap * 0.3 +
        coverageGap * 0.15 +
        maxConflictSeverity * 0.15);

    const reasonParts = [
      `${h.importance} importance`,
      confidence ? `${finalConfidence}% confidence` : "not yet scored",
      `${coveragePct}% evidence coverage`,
    ];
    if (conflicts.length > 0) reasonParts.push(`${conflicts.length} open conflict(s)`);

    const uncertainty: CriticalUncertainty = {
      hypothesisId: h.id,
      statement: h.statement,
      importance: h.importance,
      confidence: finalConfidence,
      evidenceCoveragePct: coveragePct,
      uncertaintyScore: Math.round(uncertaintyScore * 100) / 100,
      reason: reasonParts.join(", "),
    };
    return uncertainty;
  });

  return results.sort((a, b) => b.uncertaintyScore - a.uncertaintyScore);
}
