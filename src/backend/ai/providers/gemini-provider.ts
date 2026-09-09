// =====================================================================
// Gemini provider (default for development — free-tier friendly).
//
// Uses Google's official @google/genai SDK, server-only. Requests
// JSON output via responseMimeType: "application/json" (Gemini's own
// structured-output hint) — this is a provider-specific reliability
// improvement, not a replacement for the shared Zod validation in
// client.ts, which still runs identically regardless of provider.
//
// GEMINI_MODEL defaults to "gemini-2.5-flash" — a current free-tier
// model as of this writing. Gemini's free-tier lineup changes over
// time (e.g. gemini-2.0-flash was retired from the API in mid-2026),
// so this is deliberately configurable via env var rather than
// hardcoded to a single model that could later become paid-only or
// unavailable.
// =====================================================================

import { GoogleGenAI } from "@google/genai";
import type { AIProvider, GenerateTextInput, GenerateTextOutput } from "@/backend/ai/provider";
import { AIProviderError } from "@/backend/ai/provider";

if (typeof window !== "undefined") {
  throw new Error("gemini-provider.ts was imported into a browser bundle. Server-only.");
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIProviderError(
      "gemini",
      "invalid_api_key",
      "Missing GEMINI_API_KEY. See .env.example — required for AI_PROVIDER=gemini (the default).",
    );
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini" as const;
  readonly defaultModel = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  /**
   * Gemini's free tier has no equivalent to Anthropic's native
   * web_search tool reliably available in this implementation — see
   * research.service.ts, which checks this flag and declines to
   * fabricate research results when it's false rather than attempting
   * an unsupported capability.
   */
  readonly supportsWebSearch = false;

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const ai = getClient();
    const model = input.model ?? this.defaultModel;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: input.userPrompt,
        config: {
          systemInstruction: input.systemPrompt,
          maxOutputTokens: input.maxTokens,
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (!text) {
        throw new AIProviderError(
          "gemini",
          "invalid_response",
          "Gemini returned an empty response.",
        );
      }

      return { text, model };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      throw classifyGeminiError(err);
    }
  }
}

function classifyGeminiError(err: unknown): AIProviderError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (
    lower.includes("api key not valid") ||
    lower.includes("api_key_invalid") ||
    lower.includes("401")
  ) {
    return new AIProviderError(
      "gemini",
      "invalid_api_key",
      "The configured Gemini API key was rejected.",
    );
  }
  if (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("resource_exhausted")
  ) {
    return new AIProviderError(
      "gemini",
      "rate_limited",
      "Gemini rate limit reached. Please retry shortly.",
    );
  }
  if (lower.includes("quota")) {
    return new AIProviderError(
      "gemini",
      "quota_exceeded",
      "Gemini free-tier quota exceeded for this period.",
    );
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("econnrefused")
  ) {
    return new AIProviderError("gemini", "network_failure", "Could not reach the Gemini API.");
  }
  return new AIProviderError(
    "gemini",
    "unknown",
    "Gemini request failed for an unspecified reason.",
  );
}
