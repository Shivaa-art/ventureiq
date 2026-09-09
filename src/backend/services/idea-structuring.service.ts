// =====================================================================
// ideaParser — Idea Structuring Engine (Phase 3, Step 2).
//
// Transforms a founder's raw, unstructured business idea submission
// into a StructuredBusinessIdea. The model's output is validated
// against StructuredBusinessIdeaSchema (src/lib/types/schemas.ts)
// before it is ever persisted — if validation fails, this throws
// StructuredGenerationError rather than fabricating a fallback
// structure, per Phase 3's explicit instruction: "If parsing fails, do
// not create fake output. Return an understandable error and allow
// retry."
// =====================================================================

import { generateStructured, StructuredGenerationError } from "@/backend/ai/client";
import { StructuredBusinessIdeaSchema } from "@/lib/types/schemas";
import type { RawBusinessIdeaInput, StructuredBusinessIdea } from "@/lib/types/domain";

export const IDEA_STRUCTURING_PROMPT_VERSION = "idea-structuring-v1";

const SYSTEM_PROMPT = `You are the idea structuring engine inside VentureIQ, a business-idea validation platform.

Your ONLY job is to convert a founder's raw, informally-described business idea into a structured JSON object.

Rules:
- Do not invent facts the founder did not state or clearly imply. Where information is missing, make the most reasonable, conservative inference from context and note it as an inference, not a certainty.
- "keyAssumptions" should list the handful of things this structuring relies on being true (e.g. "assumes the stated target city is the primary launch market") — these are structuring-level assumptions, not business-validation hypotheses.
- Respond with a single JSON object matching exactly this shape (all fields required unless noted):
{
  "industry": string,
  "location": { "country": string, "state"?: string, "city"?: string },
  "customerSegment": string,
  "problem": string,
  "solution": string,
  "businessModel": string,
  "pricingAssumption": string,
  "investmentAssumption": string,
  "revenueModel": string,
  "keyAssumptions": string[] (1 to 12 items)
}`;

function buildUserPrompt(raw: RawBusinessIdeaInput): string {
  const lines = [
    `Business name: ${raw.businessName}`,
    `Description: ${raw.description}`,
    raw.industry && `Stated industry: ${raw.industry}`,
    (raw.country || raw.state || raw.city) &&
      `Stated location: ${[raw.city, raw.state, raw.country].filter(Boolean).join(", ")}`,
    raw.targetCustomer && `Stated target customer: ${raw.targetCustomer}`,
    raw.problem && `Stated problem: ${raw.problem}`,
    raw.solution && `Stated solution: ${raw.solution}`,
    raw.businessModel && `Stated business model: ${raw.businessModel}`,
    raw.expectedPricing && `Stated expected pricing: ${raw.expectedPricing}`,
    raw.estimatedInvestment && `Stated estimated investment: ${raw.estimatedInvestment}`,
    raw.revenueModel && `Stated revenue model: ${raw.revenueModel}`,
  ].filter(Boolean);

  return `Structure this business idea:\n\n${lines.join("\n")}`;
}

export async function parseIdea(
  raw: RawBusinessIdeaInput,
): Promise<{ structured: StructuredBusinessIdea; model: string }> {
  try {
    const { data, model } = await generateStructured(StructuredBusinessIdeaSchema, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(raw),
      promptVersion: IDEA_STRUCTURING_PROMPT_VERSION,
      maxTokens: 1500,
    });
    return { structured: data, model };
  } catch (err) {
    if (err instanceof StructuredGenerationError) {
      throw err;
    }
    throw new StructuredGenerationError(
      err instanceof Error ? err.message : "Idea structuring failed for an unknown reason.",
      "",
      err,
    );
  }
}
