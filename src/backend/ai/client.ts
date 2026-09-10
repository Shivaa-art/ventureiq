// =====================================================================
// Provider-agnostic structured-AI client.
//
// SECURITY: reads AI_PROVIDER, GEMINI_API_KEY / ANTHROPIC_API_KEY.
// Never import this from a route component or anything bundled for
// the browser — see the same guard pattern as src/backend/db/client.ts.
//
// DESIGN: this is the ONLY entry point every AI-facing service
// (ideaParser, assumptionExtractor, hypothesisGenerator,
// evidenceRequirementGenerator, evidenceClassifier, research planner)
// calls. It forces JSON-only output from whichever provider is
// configured, then validates that output against a caller-supplied
// Zod schema before returning it.
//
// IMPORTANT:
// - No fabricated fallback data is ever returned.
// - Invalid JSON is retried once with a stricter JSON-only prompt.
// - Markdown JSON fences are supported.
// - Accidental text surrounding a JSON object is handled.
// - Zod validation remains mandatory before data reaches downstream
//   services or the database.
// =====================================================================

import type { ZodType } from "zod";
import type { AIProvider } from "@/backend/ai/provider";
import { AIProviderError } from "@/backend/ai/provider";
import { GeminiProvider } from "@/backend/ai/providers/gemini-provider";
import { AnthropicProvider } from "@/backend/ai/providers/anthropic-provider";

if (typeof window !== "undefined") {
  throw new Error(
    "src/backend/ai/client.ts was imported into a browser bundle. " +
      "This module reads server-only API keys and must only be used inside src/backend/.",
  );
}

let provider: AIProvider | null = null;

/**
 * Gemini is the default provider.
 *
 * AI_PROVIDER=anthropic switches to Anthropic.
 * Any other/unset value falls back to Gemini.
 */
export function getAIProvider(): AIProvider {
  if (provider) return provider;

  const configured = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();

  provider =
    configured === "anthropic"
      ? new AnthropicProvider()
      : new GeminiProvider();

  return provider;
}

export class StructuredGenerationError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StructuredGenerationError";
  }
}

export interface GenerateStructuredOptions {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;

  /**
   * Bumped whenever the prompt/schema pairing changes,
   * so stored records remain traceable.
   */
  promptVersion: string;
}

/**
 * Calls the configured AI provider and requires a valid structured result.
 *
 * Flow:
 *
 * Provider
 *    ↓
 * JSON response
 *    ↓
 * JSON extraction
 *    ↓
 * JSON.parse()
 *    ↓
 * Zod validation
 *    ↓
 * validated data
 *
 * If the first response cannot be parsed or validated, the model is
 * called one additional time with a stricter JSON-only instruction.
 *
 * No fallback/fabricated data is ever returned.
 */
export async function generateStructured<T>(
  schema: ZodType<T>,
  options: GenerateStructuredOptions,
): Promise<{ data: T; model: string; promptVersion: string }> {
  const ai = getAIProvider();

  let text: string;
  let model: string;

  // ================================================================
  // FIRST AI REQUEST
  // ================================================================
  try {
    const result = await ai.generateText({
      systemPrompt: options.systemPrompt,
      userPrompt: options.userPrompt,
      maxTokens: options.maxTokens ?? 2000,
      model: options.model,
    });

    text = result.text;
    model = result.model;
  } catch (err) {
    if (err instanceof AIProviderError) {
      throw new StructuredGenerationError(err.message, "", err);
    }

    throw new StructuredGenerationError(
      err instanceof Error
        ? err.message
        : "AI provider request failed for an unknown reason.",
      "",
      err,
    );
  }

  // ================================================================
  // FIRST PARSE + VALIDATION ATTEMPT
  // ================================================================
  const firstAttempt = parseAndValidate(schema, text);

  if (firstAttempt.success) {
    return {
      data: firstAttempt.data,
      model,
      promptVersion: options.promptVersion,
    };
  }

  // ================================================================
  // SECOND AI REQUEST
  //
  // Gemini can occasionally return malformed JSON or harmless
  // surrounding text even when application/json is requested.
  //
  // We retry once with an explicitly reinforced JSON-only instruction.
  // ================================================================
  try {
    const retryResult = await ai.generateText({
      systemPrompt: `${options.systemPrompt}

IMPORTANT OUTPUT REQUIREMENT:
Return ONLY one valid JSON object.

Do not use Markdown.
Do not use code fences.
Do not write \`\`\`json.
Do not add explanations before the JSON.
Do not add explanations after the JSON.
Do not include comments.
Do not include trailing commas.

The complete response must be directly parseable by JSON.parse().`,

      userPrompt: `${options.userPrompt}

STRICT JSON OUTPUT:
Return exactly one valid JSON object.
Return JSON only.
No Markdown.
No code fences.
No explanation outside the JSON object.
The complete response must be directly parseable by JSON.parse().`,

      maxTokens: options.maxTokens ?? 2000,
      model: options.model,
    });

    const retryAttempt = parseAndValidate(schema, retryResult.text);

    if (retryAttempt.success) {
      return {
        data: retryAttempt.data,
        model: retryResult.model,
        promptVersion: options.promptVersion,
      };
    }

    throw new StructuredGenerationError(
      retryAttempt.error,
      retryResult.text,
      retryAttempt.cause,
    );
  } catch (err) {
    if (err instanceof StructuredGenerationError) {
      throw err;
    }

    throw new StructuredGenerationError(
      err instanceof Error
        ? err.message
        : "Structured AI generation failed after retry.",
      text,
      err,
    );
  }
}

/**
 * Parses JSON and validates it against the caller-provided Zod schema.
 */
function parseAndValidate<T>(
  schema: ZodType<T>,
  text: string,
):
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      cause?: unknown;
    } {
  const cleaned = extractJsonObject(text);

  let parsedJson: unknown;

  // ================================================================
  // JSON PARSING
  // ================================================================
  try {
    parsedJson = JSON.parse(cleaned);
  } catch (cause) {
    return {
      success: false,
      error: "Model output was not valid JSON.",
      cause,
    };
  }

  // ================================================================
  // ZOD VALIDATION
  // ================================================================
  const result = schema.safeParse(parsedJson);

  if (!result.success) {
    return {
      success: false,
      error: `Model output failed schema validation: ${result.error.message}`,
      cause: result.error,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * Extracts a JSON object from common LLM response formats.
 *
 * Handles:
 *
 * 1. Pure JSON
 *
 * {
 *   "assumptions": []
 * }
 *
 * 2. Markdown JSON fences
 *
 * ```json
 * {
 *   "assumptions": []
 * }
 * ```
 *
 * 3. Accidental surrounding text
 *
 * Here is the JSON:
 * {
 *   "assumptions": []
 * }
 */
function extractJsonObject(text: string): string {
  const trimmed = text.trim();

  // ---------------------------------------------------------------
  // Case 1: Already pure JSON
  // ---------------------------------------------------------------
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  // ---------------------------------------------------------------
  // Case 2: Markdown code fence
  // ---------------------------------------------------------------
  const fenced = trimmed.match(
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i,
  );

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  // ---------------------------------------------------------------
  // Case 3: JSON surrounded by accidental model text
  // ---------------------------------------------------------------
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  // ---------------------------------------------------------------
  // Case 4: Return original text so JSON.parse() produces the
  // correct structured-generation error.
  // ---------------------------------------------------------------
  return trimmed;
}