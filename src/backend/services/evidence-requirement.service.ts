// =====================================================================
// evidenceRequirementGenerator — Evidence Requirement Engine
// (Phase 3, Step 6 & 7 — domain adaptation).
//
// For a single hypothesis, determines what evidence would actually be
// needed to evaluate it. This is called once PER hypothesis (not one
// giant prompt for all of them) so each requirement set is grounded in
// that specific hypothesis's category and the business's industry —
// this is what makes a restaurant idea get "footfall, local
// demographics" while a SaaS idea gets "search demand, competitor
// pricing" for a structurally similar willingness-to-pay hypothesis.
// =====================================================================

import { generateStructured, StructuredGenerationError } from "@/backend/ai/client";
import { GeneratedEvidenceRequirementsSchema } from "@/lib/types/schemas";
import type { Hypothesis, StructuredBusinessIdea } from "@/lib/types/domain";

export const EVIDENCE_REQUIREMENT_PROMPT_VERSION = "evidence-requirement-v1";

const SYSTEM_PROMPT = `You are the evidence-requirement engine inside VentureIQ, a business-idea validation platform.

Given one specific hypothesis and the industry/business context it belongs to, determine what evidence would actually be needed to evaluate it — and generate evidence requirements that are SPECIFIC to this business's domain, not generic.

Domain adaptation is critical: the same hypothesis category (e.g. "willingness to pay") calls for very different evidence types depending on the industry. A restaurant's pricing hypothesis needs footfall data and local demographics; a SaaS pricing hypothesis needs search demand and competitor pricing pages; a manufacturing hypothesis needs input costs and supplier reliability; an agriculture hypothesis needs seasonality and government programs. Tailor every requirement to the actual industry given — do not output the same generic list regardless of domain.

Rules:
- Generate 2 to 6 evidence requirements for this hypothesis.
- evidenceType is a short machine-friendly label (e.g. "competitor_pricing", "customer_survey", "footfall_data", "supplier_reliability").
- minimumEvidenceLevel reflects how strong the evidence needs to be to meaningfully move confidence: "low" for a quick directional signal, up to "critical" for something that should be near-conclusive before proceeding.
- preferredSources lists realistic source types for finding this evidence (e.g. "government census data", "app store reviews", "industry association reports", "direct customer interviews") — keep each entry short.
- Respond with a single JSON object: { "hypothesisId": string, "requirements": [ { "evidenceType": string, "description": string, "importance": "low"|"medium"|"high"|"critical", "minimumEvidenceLevel": "low"|"medium"|"high"|"critical", "preferredSources": string[] } ] }`;

function buildUserPrompt(idea: StructuredBusinessIdea, hypothesis: Hypothesis): string {
  return [
    `Industry: ${idea.industry}`,
    `Location: ${[idea.location.city, idea.location.state, idea.location.country].filter(Boolean).join(", ")}`,
    `Business model: ${idea.businessModel}`,
    ``,
    `Hypothesis ID: ${hypothesis.id}`,
    `Hypothesis category: ${hypothesis.category}`,
    `Hypothesis statement: ${hypothesis.statement}`,
    `Validation criteria: ${hypothesis.validationCriteria}`,
    hypothesis.threshold
      ? `Proposed threshold: ${hypothesis.threshold} (${hypothesis.thresholdType})`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateEvidenceRequirements(
  idea: StructuredBusinessIdea,
  hypothesis: Hypothesis,
): Promise<{
  requirements: Array<{
    evidenceType: string;
    description: string;
    importance: string;
    minimumEvidenceLevel: string;
    preferredSources: string[];
  }>;
  model: string;
}> {
  try {
    const { data, model } = await generateStructured(GeneratedEvidenceRequirementsSchema, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(idea, hypothesis),
      promptVersion: EVIDENCE_REQUIREMENT_PROMPT_VERSION,
      maxTokens: 1500,
    });
    return { requirements: data.requirements, model };
  } catch (err) {
    if (err instanceof StructuredGenerationError) throw err;
    throw new StructuredGenerationError(
      err instanceof Error
        ? err.message
        : "Evidence requirement generation failed for an unknown reason.",
      "",
      err,
    );
  }
}
