// =====================================================================
// Opportunity dimension mapping (Phase 5, Step 6 & 7).
//
// Fully deterministic — no LLM call. Maps each hypothesis category to
// the opportunity dimension(s) it speaks to, then derives each
// dimension's score/confidence/reasoning from the mapped hypotheses'
// already-computed confidence scores and evidence — never from a
// fresh model judgment call. A dimension with no mapped hypotheses (or
// no evidence yet) is marked NOT_APPLICABLE / unscored rather than
// defaulted to a mid-point number.
//
// This is a first-pass ("dimension-mapping-v1"), explainable heuristic
// — score favors the DIRECTION the evidence points (majority
// supporting vs. contradicting), while confidence reflects how much
// and how reliable that evidence is, keeping the two genuinely
// separate axes Phase 5 Step 8 requires.
// =====================================================================

import type {
  ConfidenceScore,
  Evidence,
  Hypothesis,
  HypothesisCategory,
  OpportunityDimensionKey,
  OpportunityDimensionScore,
  OpportunityDimensions,
} from "@/lib/types/domain";

export const DIMENSION_MAPPING_VERSION = "dimension-mapping-v1";

const CATEGORY_TO_DIMENSION: Record<HypothesisCategory, OpportunityDimensionKey> = {
  customer_problem: "customer_pain",
  market_demand: "market_demand",
  willingness_to_pay: "revenue_potential",
  competition: "competition",
  revenue: "revenue_potential",
  profitability: "profitability",
  scalability: "scalability",
  operations: "operational_complexity",
  regulation: "regulatory_risk",
  supply: "operational_complexity",
  technology: "investment_feasibility",
  go_to_market: "market_timing",
};

export interface BuildDimensionsInput {
  hypotheses: Hypothesis[];
  confidenceByHypothesis: Record<string, ConfidenceScore | undefined>;
  evidenceByHypothesis: Record<string, Evidence[]>;
}

const ALL_DIMENSIONS: OpportunityDimensionKey[] = [
  "market_demand",
  "customer_pain",
  "competition",
  "revenue_potential",
  "profitability",
  "scalability",
  "investment_feasibility",
  "operational_complexity",
  "market_timing",
  "regulatory_risk",
  "government_support",
];

export function buildOpportunityDimensions(input: BuildDimensionsInput): OpportunityDimensions {
  const byDimension = new Map<OpportunityDimensionKey, Hypothesis[]>();
  for (const h of input.hypotheses) {
    const dim = CATEGORY_TO_DIMENSION[h.category];
    const list = byDimension.get(dim) ?? [];
    list.push(h);
    byDimension.set(dim, list);
  }

  const result = {} as OpportunityDimensions;

  for (const dimKey of ALL_DIMENSIONS) {
    const mapped = byDimension.get(dimKey) ?? [];
    if (mapped.length === 0) {
      result[dimKey] = {
        applicable: false,
        score: 0,
        confidence: 0,
        reasoning: "No hypothesis in this validation plan maps to this dimension.",
        limitation: null,
        supportingEvidenceIds: [],
        contradictingEvidenceIds: [],
        recommendation: "Not applicable to this business as currently structured.",
      };
      continue;
    }

    result[dimKey] = scoreDimension(
      dimKey,
      mapped,
      input.confidenceByHypothesis,
      input.evidenceByHypothesis,
    );
  }

  return result;
}

function scoreDimension(
  dimKey: OpportunityDimensionKey,
  hypotheses: Hypothesis[],
  confidenceByHypothesis: Record<string, ConfidenceScore | undefined>,
  evidenceByHypothesis: Record<string, Evidence[]>,
): OpportunityDimensionScore {
  let favorabilitySum = 0;
  let confidenceSum = 0;
  let count = 0;
  const supportingIds: string[] = [];
  const contradictingIds: string[] = [];
  let totalEvidence = 0;

  for (const h of hypotheses) {
    const confidence = confidenceByHypothesis[h.id];
    const evidence = (evidenceByHypothesis[h.id] ?? []).filter(
      (e) =>
        (e.dataStatus === "real" || e.dataStatus === "user_provided") &&
        e.reviewStatus === "accepted",
    );
    const supporting = evidence.filter((e) => e.supportDirection === "supports");
    const contradicting = evidence.filter((e) => e.supportDirection === "contradicts");
    supportingIds.push(...supporting.map((e) => e.id));
    contradictingIds.push(...contradicting.map((e) => e.id));
    totalEvidence += evidence.length;

    const finalConfidence = confidence?.finalConfidence ?? 0;
    // Favorability: how good this hypothesis's evidence makes the
    // opportunity look, distinct from how CERTAIN that read is. If
    // evidence leans supporting, high confidence => high favorability;
    // if it leans contradicting, high confidence => LOW favorability
    // (we're quite sure this dimension is a weak spot).
    const leansSupporting = supporting.length >= contradicting.length;
    const favorability = leansSupporting ? finalConfidence : 100 - finalConfidence;

    favorabilitySum += favorability;
    confidenceSum += finalConfidence;
    count += 1;
  }

  const score = Math.round((favorabilitySum / count) * 100) / 100;
  const confidence = Math.round((confidenceSum / count) * 100) / 100;

  const reasoning =
    `Derived from ${hypotheses.length} hypothesis/hypotheses (${hypotheses.map((h) => h.category).join(", ")}) ` +
    `with ${totalEvidence} total evidence item(s); average confidence ${confidence}%.`;

  const limitation =
    totalEvidence === 0
      ? "No real evidence collected yet for the hypotheses behind this dimension."
      : confidence < 40
        ? "Evidence quality/coverage behind this dimension is still weak — treat the score as indicative only."
        : null;

  return {
    applicable: true,
    score,
    confidence,
    reasoning,
    limitation,
    supportingEvidenceIds: supportingIds,
    contradictingEvidenceIds: contradictingIds,
    recommendation:
      confidence < 40
        ? `Collect more evidence before relying on the ${dimKey.replace(/_/g, " ")} assessment.`
        : score >= 60
          ? `Evidence currently supports this dimension; keep monitoring as the plan evolves.`
          : `Evidence currently raises concerns on this dimension — prioritize resolving it.`,
  };
}
