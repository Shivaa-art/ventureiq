// =====================================================================
// Evidence Provider abstraction (Phase 8).
//
// Every source of evidence — demo data, user-submitted evidence, and
// (later) live web/news/market-data providers — implements this same
// interface so the collection stage of the pipeline never needs to
// know or care where an EvidenceItem came from. Only `providerId` +
// `dataStatus` on the resulting item tell that story downstream.
//
// IMPORTANT: no provider is ever allowed to claim dataStatus "real"
// unless it genuinely retrieved live external data. DemoEvidenceProvider
// always emits "demo"; UserEvidenceProvider always emits "user_provided".
// A future WebSearchProvider would be the first to legitimately emit
// "real". This constraint is enforced by construction (each provider's
// dataStatus is a fixed literal, not a parameter it can be told to lie
// about) rather than left to convention.
// =====================================================================

import type { z } from "zod";
import type { EvidenceItemSchema } from "@/lib/types/schemas";
import type { EvidenceRequirement, StructuredBusinessIdea, SourceType } from "@/lib/types/domain";

export type EvidenceItemDraft = z.infer<typeof EvidenceItemSchema>;

/**
 * What a provider actually knows how to produce: raw content and
 * where it came from. Deterministic quality scores
 * (reliability/relevance/recency/independence) and the final
 * supportDirection classification are NOT a provider's responsibility
 * — those are computed by evidence-quality.ts and
 * evidence-classification.service.ts respectively, uniformly across
 * every provider, so quality scoring can't drift per-source and a
 * provider can't quietly assert its own findings are correct.
 */
export type RawEvidenceContent = Pick<
  EvidenceItemDraft,
  | "hypothesisId"
  | "evidenceRequirementId"
  | "source"
  | "sourceType"
  | "sourceUrl"
  | "sourceTitle"
  | "publicationDate"
  | "summary"
  | "provenance"
  | "dataStatus"
>;

export interface EvidenceCollectionContext {
  businessIdea: StructuredBusinessIdea;
  requirement: EvidenceRequirement;
}

export interface EvidenceProvider {
  /** Stable identifier stored in every item's provenance.providerId. */
  readonly id: string;
  readonly version: string;

  /**
   * Whether this provider is actually usable right now (e.g. an API key
   * is configured). The collection stage must skip unavailable providers
   * rather than silently returning empty/fake results as if the provider
   * had genuinely searched and found nothing.
   */
  isAvailable(): boolean;

  /**
   * Attempt to produce evidence content for a single requirement. May
   * return an empty array — that is a legitimate "found nothing", to be
   * interpreted by the Gap Detection stage, not hidden. Content only —
   * no quality scores, no classification (see RawEvidenceContent).
   */
  collect(context: EvidenceCollectionContext): Promise<RawEvidenceContent[]>;
}

export type { SourceType };
