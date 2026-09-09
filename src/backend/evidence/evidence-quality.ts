// =====================================================================
// Deterministic evidence-quality scoring (Phase 4, Step 6).
//
// PRINCIPLE: the LLM may extract or classify information, but it never
// invents these four numbers. Every score here is a pure function of
// already-known, structural facts about the evidence item — its
// source type, its data status, its publication date, and whether it
// is linked to a specific evidence requirement — not of the LLM's
// opinion about the content's quality.
//
// The tier tables below are a first-pass, documented heuristic
// (analogous to confidence-engine.ts's "v1" formula) — reasonable
// defaults that make the mechanism's behavior fully explainable, not a
// claim of empirically-tuned accuracy.
// =====================================================================

import type { DataStatus, SourceType } from "@/lib/types/domain";

export const EVIDENCE_QUALITY_FORMULA_VERSION = "evidence-quality-v1";

/**
 * Reliability: how much to trust this source TYPE in general,
 * independent of this specific item's content. Government/regulatory
 * data and controlled experiments sit at the top; single anecdotal
 * customer feedback sits at the bottom.
 */
const RELIABILITY_BY_SOURCE_TYPE: Record<SourceType, number> = {
  government: 90,
  regulatory: 85,
  experiment: 80,
  market_data: 75,
  financial: 75,
  survey: 65,
  competitor: 65,
  pricing: 60,
  interview: 55,
  customer_feedback: 50,
  other: 40,
};

/**
 * Independence: how much the source's own interests could bias the
 * finding. Government data and controlled experiments are relatively
 * independent of the business's own claims; a competitor's own pricing
 * page is a primary but self-interested source about itself.
 */
const INDEPENDENCE_BY_SOURCE_TYPE: Record<SourceType, number> = {
  government: 90,
  regulatory: 85,
  market_data: 80,
  experiment: 75,
  financial: 70,
  pricing: 70,
  survey: 65,
  interview: 60,
  customer_feedback: 55,
  competitor: 50,
  other: 40,
};

export function reliabilityScore(sourceType: SourceType, dataStatus: DataStatus): number {
  const base = RELIABILITY_BY_SOURCE_TYPE[sourceType];
  return applyDataStatusDiscount(base, dataStatus);
}

export function independenceScore(sourceType: SourceType, dataStatus: DataStatus): number {
  const base = INDEPENDENCE_BY_SOURCE_TYPE[sourceType];
  return applyDataStatusDiscount(base, dataStatus);
}

/**
 * Demo/mock evidence is synthetic by construction — it should never
 * score as highly as a genuinely-sourced item, even before it's
 * excluded from confidence calculations entirely (see
 * confidence-engine.ts, which filters dataStatus to "real" |
 * "user_provided" only). The discount here is a second, independent
 * safeguard: even if a future code path forgot that filter, demo
 * evidence's own scores make it look clearly weaker.
 */
function applyDataStatusDiscount(base: number, dataStatus: DataStatus): number {
  switch (dataStatus) {
    case "demo":
    case "mock":
      return Math.round(base * 0.3);
    case "unavailable":
      return 0;
    default:
      return base;
  }
}

/**
 * Recency: how fresh the finding is. Evidence with no known
 * publication date is treated as neutral (50) rather than penalized —
 * unknown recency is not the same as old, and Phase 4's core principle
 * is "never treat absence of information as a negative signal."
 */
export function recencyScore(
  publicationDate: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!publicationDate) return 50;
  const published = new Date(publicationDate);
  if (Number.isNaN(published.getTime())) return 50;

  const ageDays = Math.max(0, (now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays <= 90) return 100;
  if (ageDays <= 365) return 80;
  if (ageDays <= 730) return 60;
  if (ageDays <= 1825) return 40;
  return 20;
}

/**
 * Deterministic source fingerprint for independence deduplication
 * (Phase 5, Step 3). If a URL is present, the fingerprint is the
 * URL's host + pathname (query string and fragment stripped, so the
 * same article with different tracking params still matches); without
 * a URL, it's the normalized free-text source name. Two evidence items
 * sharing a fingerprint are treated as the same underlying source by
 * the confidence engine, not as two independent data points.
 */
export function computeSourceFingerprint(input: {
  sourceUrl?: string | null;
  source: string;
}): string {
  if (input.sourceUrl) {
    try {
      const url = new URL(input.sourceUrl);
      return `${url.hostname.replace(/^www\./, "")}${url.pathname}`
        .toLowerCase()
        .replace(/\/+$/, "");
    } catch {
      // fall through to source-name fingerprinting if the URL doesn't parse
    }
  }
  return input.source.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Relevance: how directly this item speaks to the specific hypothesis/
 * requirement it's attached to. Evidence explicitly linked to one of
 * the hypothesis's own generated evidence requirements starts higher
 * than free-floating evidence attached to a hypothesis with no
 * requirement link; a simple keyword overlap between the evidence's
 * summary and the requirement's evidenceType nudges it further.
 */
export function relevanceScore(input: {
  hasRequirementLink: boolean;
  evidenceTypeKeyword?: string | null;
  summary?: string | null;
}): number {
  let score = input.hasRequirementLink ? 70 : 50;

  if (input.evidenceTypeKeyword && input.summary) {
    const keyword = input.evidenceTypeKeyword.toLowerCase().replace(/_/g, " ");
    const haystack = input.summary.toLowerCase();
    if (keyword.length > 2 && haystack.includes(keyword)) {
      score += 15;
    }
  }

  return Math.max(0, Math.min(100, score));
}
