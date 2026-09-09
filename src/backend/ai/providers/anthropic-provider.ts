// =====================================================================
// Anthropic provider (future-compatible option — AI_PROVIDER=anthropic).
//
// This is the exact same call shape client.ts used directly before
// this refactor — only moved behind the AIProvider interface. Text
// generation behavior is unchanged; only where the Anthropic SDK is
// imported from has moved.
// =====================================================================

import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, GenerateTextInput, GenerateTextOutput } from "@/backend/ai/provider";
import { AIProviderError } from "@/backend/ai/provider";

if (typeof window !== "undefined") {
  throw new Error("anthropic-provider.ts was imported into a browser bundle. Server-only.");
}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIProviderError(
      "anthropic",
      "invalid_api_key",
      "Missing ANTHROPIC_API_KEY. See .env.example — required when AI_PROVIDER=anthropic.",
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic" as const;
  readonly defaultModel = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  /** Anthropic's native web_search tool backs the research engine — see web-search-provider.ts. */
  readonly supportsWebSearch = true;

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const anthropic = getClient();
    const model = input.model ?? this.defaultModel;

    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: input.maxTokens,
        system:
          `${input.systemPrompt}\n\n` +
          "Respond with ONLY a single valid JSON object or array as instructed. " +
          "No markdown code fences, no commentary, no preamble, no trailing text.",
        messages: [{ role: "user", content: input.userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      const text = textBlock && "text" in textBlock ? textBlock.text : "";
      if (!text) {
        throw new AIProviderError(
          "anthropic",
          "invalid_response",
          "Anthropic returned an empty response.",
        );
      }

      return { text, model };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      throw classifyAnthropicError(err);
    }
  }
}

function classifyAnthropicError(err: unknown): AIProviderError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes("401") || lower.includes("authentication")) {
    return new AIProviderError(
      "anthropic",
      "invalid_api_key",
      "The configured Anthropic API key was rejected.",
    );
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return new AIProviderError(
      "anthropic",
      "rate_limited",
      "Anthropic rate limit reached. Please retry shortly.",
    );
  }
  if (lower.includes("quota") || lower.includes("credit")) {
    return new AIProviderError(
      "anthropic",
      "quota_exceeded",
      "Anthropic quota/credit balance exhausted.",
    );
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("econnrefused")
  ) {
    return new AIProviderError(
      "anthropic",
      "network_failure",
      "Could not reach the Anthropic API.",
    );
  }
  return new AIProviderError(
    "anthropic",
    "unknown",
    "Anthropic request failed for an unspecified reason.",
  );
}
