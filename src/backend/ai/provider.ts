// =====================================================================
// AI Provider abstraction.
//
// PRINCIPLE: every AI-facing service (ideaParser, assumptionExtractor,
// hypothesisGenerator, evidenceRequirementGenerator, evidenceClassifier,
// research planner) calls generateStructured() in client.ts, which
// itself calls whatever AIProvider is configured. Services never
// import the Anthropic or Gemini SDK directly, and never know which
// provider actually served a given call — only client.ts and the two
// provider implementations do.
//
// This is what makes switching AI_PROVIDER a configuration change, not
// a code change: the JSON-parse + Zod-validate flow in client.ts is
// identical regardless of which provider produced the raw text.
// =====================================================================

export interface GenerateTextInput {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  /** Explicit model override, if the caller wants a specific one; otherwise the provider's configured default is used. */
  model?: string;
}

export interface GenerateTextOutput {
  text: string;
  model: string;
}

export interface AIProvider {
  readonly id: "anthropic" | "gemini";
  readonly defaultModel: string;
  /** Whether this provider can perform real, grounded external web search (Phase 6's research engine). Only Anthropic does in this implementation — see research.service.ts. */
  readonly supportsWebSearch: boolean;

  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
}

/**
 * Thrown by a provider implementation on any failure — invalid key,
 * rate limit, quota exceeded, malformed response, network failure.
 * Never carries the raw API key or other secrets; `providerMessage` is
 * a sanitized, provider-specific description safe to log server-side
 * (and safe enough to surface to StructuredGenerationError's message,
 * which callers may show to the user).
 */
export class AIProviderError extends Error {
  constructor(
    public readonly provider: "anthropic" | "gemini",
    public readonly kind:
      | "invalid_api_key"
      | "rate_limited"
      | "quota_exceeded"
      | "invalid_response"
      | "network_failure"
      | "unknown",
    providerMessage: string,
  ) {
    super(`[${provider}:${kind}] ${providerMessage}`);
    this.name = "AIProviderError";
  }
}
