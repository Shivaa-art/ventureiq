// =====================================================================
// Validation action candidate generation (Phase 5, Steps 11 & 13).
//
// Fully deterministic — no LLM call. Turns each open, non-trivial
// evidence gap into a concrete candidate validation action, using a
// fixed method-suggestion table keyed by hypothesis category (Step 13's
// worked examples: willingness_to_pay -> pricing experiment,
// customer_problem -> customer interviews, market_demand -> landing
// page test, competition -> competitor comparison, supply/operations
// -> supplier quotation experiment, etc.). The four 0-100 input scores
// each candidate carries are computed from the gap's own severity, the
// hypothesis's importance/confidence, and a fixed per-method cost
// estimate — never invented per-candidate.
// =====================================================================

import type { z } from "zod";
import type {
  ConfidenceScore,
  EvidenceGap,
  Hypothesis,
  HypothesisCategory,
  Importance,
} from "@/lib/types/domain";
import type { ValidationActionCandidateSchema } from "@/lib/types/schemas";

type ValidationActionCandidate = z.infer<typeof ValidationActionCandidateSchema>;

interface MethodSuggestion {
  method: string;
  title: string;
  description: string;
  /** 0-100 — a fixed, documented estimate of how expensive/slow this method typically is, not derived per-candidate. */
  costScore: number;
  estimatedCost: string;
  estimatedTime: string;
}

const METHOD_BY_CATEGORY: Record<HypothesisCategory, MethodSuggestion> = {
  willingness_to_pay: {
    method: "pricing_experiment",
    title: "Run a pricing experiment",
    description:
      "Test actual willingness to pay with a real or simulated purchase decision at the proposed price point.",
    costScore: 55,
    estimatedCost: "Low–Medium",
    estimatedTime: "1–2 weeks",
  },
  customer_problem: {
    method: "customer_interviews",
    title: "Conduct customer interviews",
    description:
      "Talk directly to target customers to confirm the problem is real, frequent, and painful enough to act on.",
    costScore: 30,
    estimatedCost: "Low",
    estimatedTime: "1 week",
  },
  market_demand: {
    method: "landing_page_test",
    title: "Run a landing-page demand test",
    description:
      "Publish a landing page describing the offer and measure sign-up or waitlist conversion from targeted traffic.",
    costScore: 40,
    estimatedCost: "Low–Medium",
    estimatedTime: "1–2 weeks",
  },
  competition: {
    method: "competitor_comparison",
    title: "Run a competitor comparison / switching analysis",
    description:
      "Compare directly against the identified competitors and interview a few of their current customers about switching.",
    costScore: 35,
    estimatedCost: "Low",
    estimatedTime: "1 week",
  },
  revenue: {
    method: "unit_economics_review",
    title: "Model unit economics against comparable businesses",
    description:
      "Build a bottoms-up revenue/cost model and sanity-check it against publicly available comparable-business figures.",
    costScore: 25,
    estimatedCost: "Low",
    estimatedTime: "Few days",
  },
  profitability: {
    method: "cost_structure_analysis",
    title: "Validate the cost structure with real supplier/vendor quotes",
    description:
      "Replace assumed costs with actual quotes to see whether the margin assumption survives contact with real pricing.",
    costScore: 45,
    estimatedCost: "Low–Medium",
    estimatedTime: "1–2 weeks",
  },
  scalability: {
    method: "capacity_stress_test",
    title: "Stress-test the operational model at 3–5x current scale",
    description:
      "Walk through what breaks first (people, process, supply) if volume grew several times over, on paper or in a small pilot.",
    costScore: 40,
    estimatedCost: "Low–Medium",
    estimatedTime: "1 week",
  },
  operations: {
    method: "operational_pilot",
    title: "Run a small operational pilot",
    description:
      "Execute the core operational workflow at small scale to surface real bottlenecks before committing further investment.",
    costScore: 60,
    estimatedCost: "Medium",
    estimatedTime: "2–4 weeks",
  },
  regulation: {
    method: "regulatory_review",
    title: "Get a regulatory/compliance review",
    description:
      "Consult a domain expert or relevant authority to confirm the regulatory assumption holds in the target jurisdiction.",
    costScore: 50,
    estimatedCost: "Medium",
    estimatedTime: "1–3 weeks",
  },
  supply: {
    method: "supplier_quotation_experiment",
    title: "Collect real supplier quotations",
    description:
      "Request actual quotes from candidate suppliers to test assumed input costs, lead times, and reliability.",
    costScore: 35,
    estimatedCost: "Low",
    estimatedTime: "1–2 weeks",
  },
  technology: {
    method: "technical_feasibility_spike",
    title: "Run a technical feasibility spike",
    description:
      "Build the riskiest technical piece as a throwaway prototype to confirm the approach is actually buildable as assumed.",
    costScore: 50,
    estimatedCost: "Medium",
    estimatedTime: "1–2 weeks",
  },
  go_to_market: {
    method: "channel_test",
    title: "Test the primary go-to-market channel",
    description:
      "Run a small, time-boxed campaign through the intended acquisition channel and measure real cost-per-acquisition.",
    costScore: 45,
    estimatedCost: "Low–Medium",
    estimatedTime: "1–2 weeks",
  },
};

const IMPORTANCE_TO_SCORE: Record<Importance, number> = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 100,
};
const SEVERITY_TO_SCORE: Record<EvidenceGap["severity"], number> = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 100,
};

/**
 * Builds one candidate validation action per open gap, skipping gaps
 * whose severity is "low" on an already-low-importance hypothesis —
 * not every gap warrants a dedicated recommended action.
 */
export function generateCandidatesFromGaps(
  businessIdeaId: string,
  hypotheses: Hypothesis[],
  gapsByHypothesis: Record<string, EvidenceGap[]>,
  confidenceByHypothesis: Record<string, ConfidenceScore | undefined>,
): ValidationActionCandidate[] {
  const candidates: ValidationActionCandidate[] = [];

  for (const hypothesis of hypotheses) {
    const openGaps = (gapsByHypothesis[hypothesis.id] ?? []).filter((g) => g.status === "open");
    const confidence = confidenceByHypothesis[hypothesis.id];
    const suggestion = METHOD_BY_CATEGORY[hypothesis.category];

    for (const gap of openGaps) {
      if (gap.severity === "low" && hypothesis.importance === "low") continue;

      const businessImpactScore = IMPORTANCE_TO_SCORE[hypothesis.importance];
      const evidenceUncertaintyScore = confidence ? 100 - confidence.finalConfidence : 70;
      const evidenceGapScore = SEVERITY_TO_SCORE[gap.severity];

      candidates.push({
        businessIdeaId,
        hypothesisId: hypothesis.id,
        targetGapId: gap.id,
        actionTitle: suggestion.title,
        actionDescription: suggestion.description,
        method: suggestion.method,
        businessImpactScore,
        evidenceUncertaintyScore,
        evidenceGapScore,
        validationCostScore: suggestion.costScore,
        estimatedCost: suggestion.estimatedCost,
        estimatedTime: suggestion.estimatedTime,
        reasoning:
          `"${hypothesis.statement}" is ${hypothesis.importance} importance with ` +
          `${confidence ? `${confidence.finalConfidence}% confidence` : "no confidence score yet"} and a ` +
          `${gap.severity} severity gap: ${gap.missingRequirement}. ${suggestion.title} directly targets this gap.`,
      });
    }
  }

  return candidates;
}
