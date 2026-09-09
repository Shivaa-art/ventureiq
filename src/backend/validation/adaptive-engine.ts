// =====================================================================
// Adaptive Validation Engine (Phase 5 — validation-ranking-v1).
//
// PRINCIPLE: candidate validation actions (their title, description,
// method, and the four 0-100 input scores) are proposed deterministically
// from evidence gaps/hypotheses (see validation-action-generator.ts) —
// but the ranking itself (expectedInformationValue, priorityRank,
// priority tier) is computed here, deterministically, from those
// already-produced scores. This is what lets "why is this the #1
// recommended next action?" be answered by arithmetic rather than by
// asking a model to justify itself after the fact.
// =====================================================================

import type { ValidationActionCandidateSchema } from "@/lib/types/schemas";
import type { z } from "zod";

export const VALIDATION_RANKING_FORMULA_VERSION = "validation-ranking-v1";

export interface ValidationRankingWeights {
  businessImpact: number;
  evidenceUncertainty: number;
  evidenceGap: number;
  costPenalty: number; // fraction subtracted per unit of normalized cost
}

export const DEFAULT_VALIDATION_RANKING_WEIGHTS: ValidationRankingWeights = {
  businessImpact: 0.4,
  evidenceUncertainty: 0.3,
  evidenceGap: 0.3,
  costPenalty: 0.25,
};

type ValidationActionCandidate = z.infer<typeof ValidationActionCandidateSchema>;

export interface RankedValidationAction extends ValidationActionCandidate {
  expectedInformationValue: number;
  priorityRank: number;
  priority: "critical" | "high" | "medium" | "low";
}

/**
 * Maps expected information value to a discrete priority tier. Bands
 * are deliberately wide — most candidates should land in medium/high;
 * "critical" is reserved for the clear #1 standout, per Phase 5 Step
 * 14's "do not mark everything critical."
 */
function priorityTierFromValue(
  value: number,
  rank: number,
): "critical" | "high" | "medium" | "low" {
  if (rank === 1 && value >= 60) return "critical";
  if (value >= 60) return "high";
  if (value >= 35) return "medium";
  return "low";
}

/**
 * Ranks candidate validation actions by expected information value:
 * a weighted combination of business impact, evidence uncertainty, and
 * evidence gap severity, discounted by validation cost. Higher-value,
 * lower-cost actions to resolve the biggest uncertainties surface first.
 */
export function rankValidationActions(
  candidates: ValidationActionCandidate[],
  weights: ValidationRankingWeights = DEFAULT_VALIDATION_RANKING_WEIGHTS,
): RankedValidationAction[] {
  const scored = candidates.map((c) => {
    const costFraction = c.validationCostScore / 100;
    const rawValue =
      c.businessImpactScore * weights.businessImpact +
      c.evidenceUncertaintyScore * weights.evidenceUncertainty +
      c.evidenceGapScore * weights.evidenceGap;
    const expectedInformationValue =
      Math.round(rawValue * (1 - costFraction * weights.costPenalty) * 100) / 100;
    return { ...c, expectedInformationValue };
  });

  const sorted = [...scored].sort(
    (a, b) => b.expectedInformationValue - a.expectedInformationValue,
  );
  return sorted.map((action, index) => {
    const priorityRank = index + 1;
    return {
      ...action,
      priorityRank,
      priority: priorityTierFromValue(action.expectedInformationValue, priorityRank),
    };
  });
}
