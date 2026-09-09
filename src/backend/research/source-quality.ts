// =====================================================================
// Deterministic source-quality logic (Phase 6, Step 5).
//
// PRINCIPLE: no LLM call. A source's authority tier is derived purely
// from its domain via a documented, explainable set of pattern rules
// — not a single "official website = 100" shortcut. Reliability and
// independence scores for the resulting evidence row reuse the same
// data-status discount pattern as evidence-quality.ts (Phase 4), kept
// as a separate, additive module rather than modifying that file, per
// "do not change the existing evidence architecture unless required."
// =====================================================================

import type { DataStatus, SourceCategory } from "@/lib/types/domain";

export const SOURCE_QUALITY_FORMULA_VERSION = "source-quality-v1";

/** Base authority score by category — the documented hierarchy Phase 6 Step 5 asks for. */
const BASE_SCORE_BY_CATEGORY: Record<SourceCategory, number> = {
  government: 90,
  academic: 88,
  company_filing: 82,
  established_news: 75,
  professional_publication: 70,
  industry_organization: 65,
  company_website: 50,
  general_website: 35,
  unknown: 20,
};

// Known top-level patterns for government/academic domains — pattern-
// based, not an exhaustive registry; anything not matched falls
// through to the next category rather than defaulting to the top tier.
const GOVERNMENT_PATTERNS = [/\.gov$/, /\.gov\./, /\.nic\.in$/, /\.mil$/];
const ACADEMIC_PATTERNS = [
  /\.edu$/,
  /\.edu\./,
  /\.ac\.[a-z]{2,3}$/,
  /scholar\.google\./,
  /\barxiv\.org$/,
];
const FILING_PATTERNS = [/sec\.gov$/, /\binvestor\./, /\bir\./, /annualreports\./];

// A small, documented allow-list of widely-recognized news/analysis
// outlets — deliberately short and generic-market-skewed rather than
// exhaustive; anything not on it falls through to general_website
// rather than being silently misclassified as authoritative.
const ESTABLISHED_NEWS_DOMAINS = new Set([
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "economist.com",
  "nytimes.com",
  "bbc.com",
  "techcrunch.com",
  "theverge.com",
  "livemint.com",
  "economictimes.indiatimes.com",
  "business-standard.com",
  "moneycontrol.com",
  "forbes.com",
]);

const PROFESSIONAL_PUBLICATION_DOMAINS = new Set([
  "hbr.org",
  "mckinsey.com",
  "gartner.com",
  "statista.com",
  "nielsen.com",
]);

const INDUSTRY_ORG_PATTERNS = [/\.org$/, /association/, /federation/, /institute/];

export function categorizeSource(domain: string): SourceCategory {
  const d = domain.toLowerCase().replace(/^www\./, "");

  if (GOVERNMENT_PATTERNS.some((p) => p.test(d))) return "government";
  if (ACADEMIC_PATTERNS.some((p) => p.test(d))) return "academic";
  if (FILING_PATTERNS.some((p) => p.test(d))) return "company_filing";
  if (ESTABLISHED_NEWS_DOMAINS.has(d)) return "established_news";
  if (PROFESSIONAL_PUBLICATION_DOMAINS.has(d)) return "professional_publication";
  if (INDUSTRY_ORG_PATTERNS.some((p) => p.test(d))) return "industry_organization";
  if (d.endsWith(".com") || d.endsWith(".co") || d.endsWith(".in")) return "general_website";
  return "unknown";
}

function applyDataStatusDiscount(base: number, dataStatus: DataStatus): number {
  if (dataStatus === "demo" || dataStatus === "mock") return Math.round(base * 0.3);
  if (dataStatus === "unavailable") return 0;
  return base;
}

/** Deterministic quality score for ranking retrieved sources before selecting which ones proceed to extraction. */
export function computeSourceQualityScore(input: {
  category: SourceCategory;
  recencyScore: number; // 0-100, reuse evidence-quality.ts's recencyScore(publicationDate)
  hasAccessibleContent: boolean; // false if only a snippet/title was retrievable, not the underlying page
}): number {
  const base = BASE_SCORE_BY_CATEGORY[input.category];
  const recencyWeighted = base * 0.7 + input.recencyScore * 0.3;
  const accessibilityPenalty = input.hasAccessibleContent ? 1 : 0.6;
  return Math.round(recencyWeighted * accessibilityPenalty * 100) / 100;
}

/** Reliability score for the resulting Evidence row — same tiering as categorizeSource's base scores, discounted for demo/mock like evidence-quality.ts does. */
export function reliabilityScoreForSource(
  category: SourceCategory,
  dataStatus: DataStatus,
): number {
  return applyDataStatusDiscount(BASE_SCORE_BY_CATEGORY[category], dataStatus);
}

/** Independence score for the resulting Evidence row — government/academic sources are relatively independent of any single business's claims; a company's own site is not. */
const INDEPENDENCE_BY_CATEGORY: Record<SourceCategory, number> = {
  government: 90,
  academic: 88,
  professional_publication: 78,
  established_news: 75,
  industry_organization: 65,
  company_filing: 55, // primary but self-interested
  general_website: 45,
  company_website: 30,
  unknown: 25,
};

export function independenceScoreForSource(
  category: SourceCategory,
  dataStatus: DataStatus,
): number {
  return applyDataStatusDiscount(INDEPENDENCE_BY_CATEGORY[category], dataStatus);
}
