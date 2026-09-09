// =====================================================================
// Opportunity Score aggregator (Phase 5 — opportunity-v2).
//
// PRINCIPLE: same as the Confidence Engine — the two published numbers
// are deterministic weighted aggregates of per-dimension scores. The
// LLM may be used (in a later phase) to help produce the `reasoning`
// text and initial per-dimension `score`/`confidence` estimates from
// evidence, but the AGGREGATION step here never calls a model.
//
// v2 change from v1 (Phase 1): the single overallScore is now split
// into RAW_SCORE (weighted dimension scores only) and overallScore =
// CONFIDENCE_ADJUSTED_SCORE (the same weighting, but each dimension's
// contribution is additionally scaled by how confident its own
// evidence is) — see Phase 5, Step 8/9. Dimensions marked
// `applicable: false` (NOT_APPLICABLE) are excluded from both
// aggregates entirely, not scored as zero.
// =====================================================================

import type {
  OpportunityDimensionKey,
  OpportunityDimensions,
  OpportunityScore,
} from "@/lib/types/domain";

export const OPPORTUNITY_FORMULA_VERSION = "opportunity-v2";

export const DEFAULT_OPPORTUNITY_WEIGHTS: Record<OpportunityDimensionKey, number> = {
  market_demand: 0.15,
  customer_pain: 0.12,
  competition: 0.1,
  revenue_potential: 0.13,
  profitability: 0.1,
  scalability: 0.08,
  investment_feasibility: 0.08,
  operational_complexity: 0.06,
  market_timing: 0.06,
  regulatory_risk: 0.06,
  government_support: 0.06,
};

export interface ComputeOpportunityScoreInput {
  businessIdeaId: string;
  dimensions: OpportunityDimensions;
  weights?: Record<OpportunityDimensionKey, number>;
}

export function computeOpportunityScore(
  input: ComputeOpportunityScoreInput,
): Omit<OpportunityScore, "id" | "calculatedAt"> {
  const weights = input.weights ?? DEFAULT_OPPORTUNITY_WEIGHTS;
  const dimensionKeys = Object.keys(weights) as OpportunityDimensionKey[];

  let rawWeightedSum = 0;
  let rawWeightSum = 0;
  let adjustedWeightedSum = 0;
  let confidenceWeightedSum = 0;

  for (const key of dimensionKeys) {
    const dim = input.dimensions[key];
    // Not yet scored, or explicitly NOT_APPLICABLE to this business —
    // either way it contributes nothing and doesn't dilute the
    // remaining dimensions' relative weight.
    if (!dim || !dim.applicable) continue;

    const w = weights[key];
    rawWeightedSum += dim.score * w;
    rawWeightSum += w;

    // Confidence-adjusted: a dimension the evidence is unsure about
    // (low dim.confidence) contributes less to the adjusted score than
    // an equally-scored but well-evidenced dimension.
    const confidenceFactor = dim.confidence / 100;
    adjustedWeightedSum += dim.score * w * confidenceFactor;
    confidenceWeightedSum += w * confidenceFactor;
  }

  const rawScore = rawWeightSum === 0 ? 0 : Math.round((rawWeightedSum / rawWeightSum) * 100) / 100;
  const overallScore =
    confidenceWeightedSum === 0
      ? 0
      : Math.round((adjustedWeightedSum / confidenceWeightedSum) * 100) / 100;
  const overallConfidence =
    rawWeightSum === 0
      ? 0
      : Math.round(
          (dimensionKeys.reduce((sum, key) => {
            const dim = input.dimensions[key];
            return dim?.applicable ? sum + dim.confidence * weights[key] : sum;
          }, 0) /
            rawWeightSum) *
            100,
        ) / 100;

  return {
    businessIdeaId: input.businessIdeaId,
    rawScore,
    overallScore,
    overallConfidence,
    dimensions: input.dimensions,
    formulaVersion: OPPORTUNITY_FORMULA_VERSION,
    weights,
  };
}
