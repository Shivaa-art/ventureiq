// =====================================================================
// evidenceClassifier (Phase 4, Step 5).
//
// Determines whether a piece of evidence SUPPORTS, CONTRADICTS, or is
// NEUTRAL to a specific hypothesis. This is the one place in the
// evidence pipeline where the LLM decides something qualitative — but
// even here, its output is bounded to exactly {classification, reason,
// confidence} and Zod-validated (EvidenceClassificationSchema) before
// use. It never touches the deterministic quality scores
// (reliability/relevance/recency/independence) — those come from
// evidence-quality.ts regardless of what this function returns.
//
// Only invoked for evidence that doesn't already carry an explicit,
// human-asserted direction — user-submitted evidence skips this
// entirely and uses the founder's own label (see
// evidence-collection.service.ts).
// =====================================================================

import { generateStructured, StructuredGenerationError } from "@/backend/ai/client";
import { EvidenceClassificationSchema } from "@/lib/types/schemas";
import type { Hypothesis } from "@/lib/types/domain";

export const EVIDENCE_CLASSIFICATION_PROMPT_VERSION = "evidence-classification-v1";

const SYSTEM_PROMPT = `You are the evidence-classification engine inside VentureIQ, a business-idea validation platform.

Given a hypothesis and a specific piece of evidence, determine whether the evidence SUPPORTS the hypothesis, CONTRADICTS it, or is NEUTRAL (doesn't meaningfully move the needle either way).

Rules:
- Be conservative: only classify as SUPPORTS or CONTRADICTS if the evidence genuinely bears on the hypothesis's specific claim (including any stated threshold). Tangentially related evidence is NEUTRAL.
- "reason" must explain the classification in one or two sentences, referencing the specific content of the evidence.
- "confidence" (0-100) reflects how confident you are in this classification given the evidence's content — not how reliable the source is (that's scored separately).
- Respond with a single JSON object: { "classification": "supports"|"contradicts"|"neutral", "reason": string, "confidence": number }`;

function buildUserPrompt(
  hypothesis: Hypothesis,
  evidenceSummary: string,
  evidenceSource: string,
): string {
  return [
    `Hypothesis: ${hypothesis.statement}`,
    `Validation criteria: ${hypothesis.validationCriteria}`,
    hypothesis.threshold ? `Proposed threshold: ${hypothesis.threshold}` : "",
    ``,
    `Evidence source: ${evidenceSource}`,
    `Evidence content: ${evidenceSummary}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function classifyEvidence(
  hypothesis: Hypothesis,
  evidenceSummary: string,
  evidenceSource: string,
): Promise<{
  classification: "supports" | "contradicts" | "neutral";
  reason: string;
  confidence: number;
}> {
  try {
    const { data } = await generateStructured(EvidenceClassificationSchema, {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(hypothesis, evidenceSummary, evidenceSource),
      promptVersion: EVIDENCE_CLASSIFICATION_PROMPT_VERSION,
      maxTokens: 500,
    });
    return data;
  } catch (err) {
    if (err instanceof StructuredGenerationError) throw err;
    throw new StructuredGenerationError(
      err instanceof Error ? err.message : "Evidence classification failed for an unknown reason.",
      "",
      err,
    );
  }
}
