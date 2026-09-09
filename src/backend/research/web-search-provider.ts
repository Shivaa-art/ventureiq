// =====================================================================
// WebSearchResearchProvider (Phase 6, Step 1).
//
// The one research provider implemented for this MVP, per Phase 6's
// explicit instruction to implement only "the safest/basic web
// research provider supported by the available environment" and not
// integrate multiple paid APIs. It reuses the ANTHROPIC_API_KEY
// already configured for the rest of the pipeline (no new credential),
// via the Anthropic Messages API's native web_search tool.
//
// Interface is deliberately narrow (one method, one shape in/out) so
// NewsSearchProvider / GovernmentDataProvider / MarketDataProvider can
// later implement the same ResearchProvider contract without changing
// any caller.
//
// ANTI-FABRICATION SAFEGUARD: the model is asked to extract claims
// only from sources it actually retrieved via the tool. This provider
// cross-checks every URL the model cites against the URLs the
// web_search tool itself actually returned (from the
// web_search_tool_result content blocks) — an extraction referencing
// a URL the tool never returned is discarded rather than trusted, so
// the model cannot simply invent a plausible-looking source.
// =====================================================================

import Anthropic from "@anthropic-ai/sdk";
import { ExternalResearchResultSchema } from "@/lib/types/schemas";
import { StructuredGenerationError } from "@/backend/ai/client";

if (typeof window !== "undefined") {
  throw new Error("web-search-provider.ts was imported into a browser bundle. Server-only.");
}

export const WEB_SEARCH_PROVIDER_ID = "web-search-provider";
export const WEB_SEARCH_PROVIDER_VERSION = "1.0.0";
const RESEARCH_PROMPT_VERSION = "external-research-v1";
const DEFAULT_MODEL = "claude-sonnet-4-6";

export interface RetrievedSourceMeta {
  url: string;
  title: string | null;
  /** Anthropic's page_age is a freeform freshness string, not guaranteed ISO — never force-parsed into a date. */
  pageAgeRaw: string | null;
}

export interface ExternalExtraction {
  sourceUrl: string;
  claim: string;
  supportingText: string;
  relevance: number;
  supportDirection: "supports" | "contradicts" | "neutral";
  reason: string;
}

export interface WebSearchResearchResult {
  retrievedSources: RetrievedSourceMeta[];
  extractions: ExternalExtraction[];
  /** True if the web_search tool was never actually invoked (e.g. the model judged the query unnecessary) — treated as "no results," never fabricated. */
  searchWasInvoked: boolean;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY — required for external research.");
  client = new Anthropic({ apiKey });
  return client;
}

const SYSTEM_PROMPT = `You are the external evidence research engine inside VentureIQ, a business-idea validation platform.

You have a web_search tool. Use it to search for information relevant to the given research question and hypothesis.

After searching, extract evidence STRICTLY from what the sources you found actually say:
- "claim" must be a fact the source explicitly states — never a conclusion you draw beyond it. If a source says "Company X charges ₹499/month", the claim may state that, but must NOT become "therefore customers are willing to pay ₹499/month" unless the source itself makes that claim.
- "supportingText" must be a real excerpt or close paraphrase of the source's actual content — never invented.
- Only extract from URLs that were actually returned by your web_search tool call. Do not reference any other URL.
- If you find nothing useful, return an empty extractions array — do not fabricate a source to fill the gap.
- relevance (0-100) reflects how directly the source's content bears on the hypothesis.
- supportDirection is your classification of whether THIS SPECIFIC claim supports, contradicts, or is neutral to the hypothesis.

After using the tool, respond with ONLY a final JSON object (no markdown fences, no other text) of this exact shape:
{ "extractions": [ { "sourceUrl": string, "claim": string, "supportingText": string, "relevance": number, "supportDirection": "supports"|"contradicts"|"neutral", "reason": string } ] }
Maximum 8 extractions. Extract at most one item per distinct URL.`;

function buildUserPrompt(
  researchQuestion: string,
  hypothesisStatement: string,
  query: string,
): string {
  return [
    `Research question: ${researchQuestion}`,
    `Hypothesis being investigated: ${hypothesisStatement}`,
    `Search query to use: ${query}`,
  ].join("\n");
}

export async function runWebSearchResearch(
  researchQuestion: string,
  hypothesisStatement: string,
  query: string,
): Promise<WebSearchResearchResult> {
  const anthropic = getClient();

  let response;
  try {
    response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [
        { role: "user", content: buildUserPrompt(researchQuestion, hypothesisStatement, query) },
      ],
    });
  } catch (err) {
    throw new StructuredGenerationError(
      err instanceof Error
        ? `Web search request failed: ${err.message}`
        : "Web search request failed.",
      "",
      err,
    );
  }

  // Collect retrieved source metadata from every web_search_tool_result
  // block — this is the ONLY source of truth for "what did the tool
  // actually return," used below to reject any extraction citing a URL
  // the tool never returned.
  const retrievedSources: RetrievedSourceMeta[] = [];
  let searchWasInvoked = false;

  for (const block of response.content) {
    if (block.type === "web_search_tool_result") {
      searchWasInvoked = true;
      if (Array.isArray(block.content)) {
        for (const item of block.content) {
          if (item.type === "web_search_result") {
            retrievedSources.push({
              url: item.url,
              title: item.title ?? null,
              pageAgeRaw: item.page_age ?? null,
            });
          }
        }
      }
    }
  }

  const textBlock = [...response.content].reverse().find((b) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

  if (!searchWasInvoked) {
    // The model judged no search was needed, or the tool otherwise
    // never ran — a legitimate "nothing to report," not an error.
    return { retrievedSources: [], extractions: [], searchWasInvoked: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch (cause) {
    throw new StructuredGenerationError(
      "External research output was not valid JSON.",
      rawText,
      cause,
    );
  }

  const result = ExternalResearchResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new StructuredGenerationError(
      `External research output failed schema validation: ${result.error.message}`,
      rawText,
      result.error,
    );
  }

  const retrievedUrlSet = new Set(retrievedSources.map((s) => s.url));
  const groundedExtractions = result.data.extractions.filter((e) =>
    retrievedUrlSet.has(e.sourceUrl),
  );

  return { retrievedSources, extractions: groundedExtractions, searchWasInvoked: true };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}
