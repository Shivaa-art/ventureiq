// =====================================================================
// Error classification (Phase 7, Step 10).
//
// Distinguishes error categories so the UI can show a consistent,
// user-friendly message without ever leaking stack traces, API keys,
// or database internals. Server-side code should still log the real
// error (console.error / platform logs); this helper only shapes what
// reaches the client.
// =====================================================================

export type ErrorCategory =
  | "authentication"
  | "authorization"
  | "database"
  | "ai"
  | "research"
  | "validation"
  | "rate_limit"
  | "unknown";

export interface ClassifiedError {
  category: ErrorCategory;
  userMessage: string;
}

const CATEGORY_MESSAGES: Record<ErrorCategory, string> = {
  authentication: "Please sign in again to continue.",
  authorization: "You don't have access to this resource.",
  database: "Something went wrong saving your data. Please try again.",
  ai: "The AI service is temporarily unavailable. Please try again in a moment.",
  research: "External research couldn't be completed. You can retry from the evidence workspace.",
  validation: "Please check the information you entered.",
  rate_limit: "You're doing that a bit too fast — please wait a moment and try again.",
  unknown: "Something went wrong. Please try again.",
};

/**
 * Classifies an error into a user-facing category from whatever
 * information is available (error name, message keywords, HTTP-style
 * status if present) — a best-effort heuristic, not a claim of perfect
 * classification. Falls back to "unknown" rather than guessing wrong
 * in a way that could mislead the user (e.g. never claims
 * "authentication" unless there's a real signal for it).
 */
export function classifyError(err: unknown): ClassifiedError {
  if (err && typeof err === "object") {
    const message =
      "message" in err && typeof err.message === "string" ? err.message.toLowerCase() : "";
    const code = "code" in err && typeof err.code === "string" ? err.code : "";

    if (
      message.includes("not authenticated") ||
      message.includes("jwt") ||
      message.includes("unauthorized")
    ) {
      return { category: "authentication", userMessage: CATEGORY_MESSAGES.authentication };
    }
    if (
      message.includes("row-level security") ||
      message.includes("permission denied") ||
      code === "42501"
    ) {
      return { category: "authorization", userMessage: CATEGORY_MESSAGES.authorization };
    }
    if (message.includes("rate limit") || message.includes("429")) {
      return { category: "rate_limit", userMessage: CATEGORY_MESSAGES.rate_limit };
    }
    if (
      message.includes("structuredgenerationerror") ||
      message.includes("anthropic") ||
      message.includes("gemini") ||
      message.includes("aiprovidererror") ||
      message.includes("model")
    ) {
      return { category: "ai", userMessage: CATEGORY_MESSAGES.ai };
    }
    if (message.includes("web search") || message.includes("research")) {
      return { category: "research", userMessage: CATEGORY_MESSAGES.research };
    }
    if (message.includes("zod") || message.includes("validation") || message.includes("required")) {
      return { category: "validation", userMessage: CATEGORY_MESSAGES.validation };
    }
    if (code.startsWith("PGRST") || code.startsWith("23") || message.includes("database")) {
      return { category: "database", userMessage: CATEGORY_MESSAGES.database };
    }
  }
  return { category: "unknown", userMessage: CATEGORY_MESSAGES.unknown };
}

/** Convenience for UI code that just wants a safe string to display. */
export function friendlyErrorMessage(err: unknown): string {
  return classifyError(err).userMessage;
}
