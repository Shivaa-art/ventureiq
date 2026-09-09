# VentureIQ — AI Provider Architecture

_Added during the Gemini migration. Describes the provider-agnostic AI
layer — not a new pipeline stage, just how the existing stages reach
whichever LLM is configured._

## Why this exists

Every AI-facing service in the pipeline — `ideaParser`,
`assumptionExtractor`, `hypothesisGenerator`,
`evidenceRequirementGenerator`, `evidenceClassifier`, and the research
planner — was originally written against the Anthropic SDK directly.
To let development happen on Gemini's free tier without paying for
Anthropic credits (and without rewriting any of those six services),
the SDK call was pulled out from behind `generateStructured()` into a
small provider interface.

## The abstraction

```
services/*.ts  →  generateStructured(schema, options)  →  getAIProvider()  →  GeminiProvider | AnthropicProvider
                        (src/backend/ai/client.ts)                              (src/backend/ai/providers/*.ts)
```

- **`src/backend/ai/provider.ts`** — the `AIProvider` interface
  (`generateText`, `defaultModel`, `supportsWebSearch`) and
  `AIProviderError`, a sanitized error type every provider throws on
  failure (never carries the raw API key).
- **`src/backend/ai/providers/gemini-provider.ts`** — wraps
  `@google/genai`, requests `responseMimeType: "application/json"` for
  reliability, classifies failures (invalid key / rate limit / quota /
  network) into `AIProviderError`.
- **`src/backend/ai/providers/anthropic-provider.ts`** — the same shape,
  wrapping `@anthropic-ai/sdk`. This is the exact call `client.ts` used
  to make directly before this refactor — behavior is unchanged, only
  its location moved.
- **`src/backend/ai/client.ts`** — unchanged public API
  (`generateStructured`, `StructuredGenerationError`). Internally it
  now calls `getAIProvider().generateText()` instead of the Anthropic
  SDK directly, then runs the exact same JSON-parse → Zod-`safeParse`
  flow regardless of which provider produced the text.

No service file changed. Each one still only imports
`generateStructured`/`StructuredGenerationError` from `client.ts` —
never an SDK, never a provider class.

## Selecting a provider

`AI_PROVIDER` env var — `gemini` (default) or `anthropic`. Unset or any
other value falls back to Gemini, since Gemini is meant to be the
default for local development.

| Var | Used when |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | `AI_PROVIDER=gemini` (default) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `AI_PROVIDER=anthropic`, or real research (below) |

`GEMINI_MODEL` defaults to `gemini-2.5-flash` if unset — a free-tier
model as of this writing. Gemini's free-tier lineup changes over time
(`gemini-2.0-flash` was retired from the API mid-2026), so this is
deliberately an env var, not a hardcoded constant, in case the default
needs to change later without a code edit.

## The one real asymmetry: external research

`web-search-provider.ts` (Phase 6's research engine) is built directly
on Anthropic's native `web_search` tool — a capability with no Gemini
free-tier equivalent in this implementation. This is inherently
provider-specific and isn't behind the generic `AIProvider` interface;
it's a separate module the research engine calls directly, exactly as
before this migration.

`ResearchService.startResearchRun()` checks
`getAIProvider().supportsWebSearch` before attempting retrieval:

- **`AI_PROVIDER=anthropic`** → real web search runs exactly as it did
  before this migration, unchanged.
- **`AI_PROVIDER=gemini`** (default) → research planning (query
  generation) still runs fine on Gemini via `generateStructured`, but
  the actual source-retrieval step is skipped. Each research task is
  marked `failed` with an honest, actionable message rather than
  fabricating sources or silently returning nothing — pointing the
  founder at either switching to `AI_PROVIDER=anthropic` or using the
  separate, already-existing "Collect demo evidence" action in the
  Evidence Workspace.

No source URL, publication date, or evidence claim is ever invented to
paper over this gap — the same "never fabricate" principle that
governs the rest of the evidence engine applies here too.

## Error handling

`AIProviderError` carries a `kind` (`invalid_api_key` / `rate_limited`
/ `quota_exceeded` / `invalid_response` / `network_failure` /
`unknown`) and a sanitized message — never the API key itself.
`client.ts` wraps any `AIProviderError` (or any other thrown error)
into the pipeline's existing `StructuredGenerationError`, so every
downstream service's existing try/catch continues to work unchanged.
`src/lib/errors.ts`'s user-facing classifier was broadened to
recognize both `"anthropic"` and `"gemini"` in error messages, mapping
either to the same generic, safe "AI service temporarily unavailable"
message shown to the user.
