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
// Zod schema before returning it — nothing downstream of this
// function ever sees unvalidated model output, regardless of which
// provider produced it. This is what keeps the LLM confined to
// proposing content (a hypothesis wording, an evidence summary)
// rather than deciding facts (a final confidence number, a hypothesis
// status) — those are computed deterministically elsewhere
// (src/backend/scoring/, src/backend/validation/) and never asked of
// the model at all.
//
// Services never import the Anthropic or Gemini SDK directly — only
// this file and the two provider implementations
// (src/backend/ai/providers/*) do. Switching AI_PROVIDER is a
// configuration change, not a code change.
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
 * Gemini is the default (free-tier friendly for development).
 * AI_PROVIDER=anthropic switches to Anthropic. Any other/unset value
 * falls back to Gemini rather than failing outright, since Gemini
 * must be the default per project configuration.
 */
export function getAIProvider(): AIProvider {
  if (provider) return provider;
  const configured = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  provider = configured === "anthropic" ? new AnthropicProvider() : new GeminiProvider();
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
  /** Bumped whenever the prompt/schema pairing changes, so stored records are traceable to how they were produced. */
  promptVersion: string;
}

/**
 * Calls the currently-configured provider with a JSON-only system
 * instruction, then parses and validates the response against
 * `schema`. Throws StructuredGenerationError (never returns a
 * partially-trusted object, never fabricates a fallback) if the
 * provider call fails or its output does not conform.
 */
export async function generateStructured<T>(
  schema: ZodType<T>,
  options: GenerateStructuredOptions,
): Promise<{ data: T; model: string; promptVersion: string }> {
  const ai = getAIProvider();

  let text: string;
  let model: string;
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
    // AIProviderError already carries a sanitized, non-secret-leaking
    // message (see providers/*.ts) — safe to surface via
    // StructuredGenerationError.message to callers/UI.
    if (err instanceof AIProviderError) {
      throw new StructuredGenerationError(err.message, "", err);
    }
    throw new StructuredGenerationError(
      err instanceof Error ? err.message : "AI provider request failed for an unknown reason.",
      "",
      err,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFences(text));
  } catch (cause) {
    throw new StructuredGenerationError("Model output was not valid JSON.", text, cause);
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    throw new StructuredGenerationError(
      `Model output failed schema validation: ${result.error.message}`,
      text,
      result.error,
    );
  }

  return { data: result.data, model, promptVersion: options.promptVersion };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}
