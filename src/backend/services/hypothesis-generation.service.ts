// =====================================================================
// hypothesisGenerator — Hypothesis Generation (Phase 3, Step 4 & 5).
//
// Converts the most important assumptions into TESTABLE hypotheses —
// specific, falsifiable statements, not vague beliefs. Any numeric
// threshold the model proposes is stored with thresholdType
// "ai_proposed" (never asserted as researched fact) and the founder
// can edit or override it before approval (see validation-plan
// repository/service edit paths).
//
// Only categories relevant to THIS business are generated — the model
// is explicitly instructed not to force irrelevant categories, and the
// output category set is validated against Phase 3's fixed enum
// (HypothesisCategorySchema) so downstream code can rely on it.
// =====================================================================

import { generateStructured, StructuredGenerationError } from "@/backend/ai/client";
import { GeneratedHypothesesSchema } from "@/lib/types/schemas";
import type { BusinessAssumption, StructuredBusinessIdea } from "@/lib/types/domain";

export const HYPOTHESIS_GENERATION_PROMPT_VERSION = "hypothesis-generation-v1";

const SYSTEM_PROMPT = `You are the hypothesis-generation engine inside VentureIQ, a business-idea validation platform.

Given a structured business idea and its key assumptions, generate the most important TESTABLE hypotheses — specific, falsifiable statements that could be checked against real evidence. Do not restate assumptions verbatim; sharpen them into something a piece of evidence could support or contradict.

Available categories (use ONLY these, and only the ones actually relevant to this business — do not force irrelevant categories):
customer_problem, market_demand, willingness_to_pay, competition, revenue, profitability, scalability, operations, regulation, supply, technology, go_to_market

Rules:
- Generate 3 to 10 hypotheses, prioritizing the highest-importance, highest-uncertainty ones.
- If a hypothesis naturally includes a numeric bar (e.g. "at least 30% of surveyed students..."), include it in "threshold" as a short string, set "thresholdType" to "ai_proposed", and make clear in the statement itself that this is a proposed bar, not a researched fact. If there's no natural numeric bar, omit threshold and thresholdType.
- If a hypothesis was derived from one of the numbered assumptions provided, set "assumptionIndex" to that assumption's 0-based index in the list you were given. If it doesn't trace to a specific one, omit assumptionIndex.
- validationCriteria should describe, in plain language, what evidence would need to show for this hypothesis to be considered supported.
- Respond with a single JSON object: { "hypotheses": [ { "statement": string, "category": string, "importance": "low"|"medium"|"high"|"critical", "validationCriteria": string, "threshold"?: string, "thresholdType"?: "ai_proposed", "assumptionIndex"?: number } ] }`;

function buildUserPrompt(idea: StructuredBusinessIdea, assumptions: BusinessAssumption[]): string {
  const ideaLines = [
    `Industry: ${idea.industry}`,
    `Customer segment: ${idea.customerSegment}`,
    `Problem: ${idea.problem}`,
    `Solution: ${idea.solution}`,
    `Business model: ${idea.businessModel}`,
    `Pricing assumption: ${idea.pricingAssumption}`,
    `Revenue model: ${idea.revenueModel}`,
  ].join("\n");

  const assumptionLines = assumptions
    .map((a, i) => `${i}. [${a.category}, ${a.importance}] ${a.statement}`)
    .join("\n");

  return `Business idea:\n${ideaLines}\n\nKey assumptions (indexed):\n${assumptionLines}`;
}

export async function generateHypotheses(
  idea: StructuredBusinessIdea,
  assumptions: BusinessAssumption[],
): Promise<{
  hypotheses: Array<{
    statement: string;
    category: string;
    importance: string;
    validationCriteria: string;
    threshold?: string | null;
    thresholdType?: "ai_proposed" | "user_defined" | null;
    assumptionIndex?: number | null;
  }>;
  model: string;
}> {
  try {
    const { data, model } = await generateStructured(GeneratedHypothesesSchema, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(idea, assumptions),
      promptVersion: HYPOTHESIS_GENERATION_PROMPT_VERSION,
      maxTokens: 2500,
    });
    return { hypotheses: data.hypotheses, model };
  } catch (err) {
    if (err instanceof StructuredGenerationError) throw err;
    throw new StructuredGenerationError(
      err instanceof Error ? err.message : "Hypothesis generation failed for an unknown reason.",
      "",
      err,
    );
  }
}
