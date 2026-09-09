// =====================================================================
// assumptionExtractor — Assumption Extraction (Phase 3, Step 3).
//
// Takes a StructuredBusinessIdea and identifies the important things
// the business plan is implicitly relying on being true. Every
// assumption this produces is tagged source: "ai_inferred" — the
// schema only allows that literal here (see GeneratedAssumptionSchema)
// so an inferred assumption can never silently be mislabeled as
// something the founder actually stated.
// =====================================================================

import { generateStructured, StructuredGenerationError } from "@/backend/ai/client";
import { GeneratedAssumptionsSchema } from "@/lib/types/schemas";
import type { StructuredBusinessIdea } from "@/lib/types/domain";

export const ASSUMPTION_EXTRACTION_PROMPT_VERSION = "assumption-extraction-v1";

const SYSTEM_PROMPT = `You are the assumption-extraction engine inside VentureIQ, a business-idea validation platform.

Given a structured business idea, identify the 4-8 most important assumptions the business plan is relying on being true — the things that, if false, would meaningfully undermine the idea.

Rules:
- Every assumption you list must have source "ai_inferred" — you are never told the founder's own private beliefs, only what they stated in the idea, so anything you produce here is your inference from that.
- Assumptions should be specific to THIS business, not generic startup platitudes. "There is a market" is not acceptable; "BBA students in Hyderabad currently rely on unstructured WhatsApp groups and paid tutors for exam prep" is the right level of specificity.
- category is a short free-text label you choose that fits the assumption (e.g. "customer_problem", "pricing", "competition", "regulatory", "supply_chain" — pick whatever fits, do not force a fixed taxonomy).
- Respond with a single JSON object: { "assumptions": [ { "statement": string, "category": string, "importance": "low"|"medium"|"high"|"critical", "source": "ai_inferred" } ] } with 1 to 8 items.`;

function buildUserPrompt(idea: StructuredBusinessIdea): string {
  return [
    `Industry: ${idea.industry}`,
    `Location: ${[idea.location.city, idea.location.state, idea.location.country].filter(Boolean).join(", ")}`,
    `Customer segment: ${idea.customerSegment}`,
    `Problem: ${idea.problem}`,
    `Solution: ${idea.solution}`,
    `Business model: ${idea.businessModel}`,
    `Pricing assumption: ${idea.pricingAssumption}`,
    `Investment assumption: ${idea.investmentAssumption}`,
    `Revenue model: ${idea.revenueModel}`,
    `Structuring-level assumptions already noted: ${idea.keyAssumptions.join("; ")}`,
  ].join("\n");
}

export async function extractAssumptions(idea: StructuredBusinessIdea): Promise<{
  assumptions: Array<{
    statement: string;
    category: string;
    importance: string;
    source: "ai_inferred";
  }>;
  model: string;
}> {
  try {
    const { data, model } = await generateStructured(GeneratedAssumptionsSchema, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(idea),
      promptVersion: ASSUMPTION_EXTRACTION_PROMPT_VERSION,
      maxTokens: 1500,
    });
    return { assumptions: data.assumptions, model };
  } catch (err) {
    if (err instanceof StructuredGenerationError) throw err;
    throw new StructuredGenerationError(
      err instanceof Error ? err.message : "Assumption extraction failed for an unknown reason.",
      "",
      err,
    );
  }
}
