// =====================================================================
// DemoEvidenceProvider (Phase 8; expanded Phase 4).
//
// Produces clearly-labeled synthetic evidence content so the pipeline
// and UI can be exercised end-to-end before any live external data
// source is configured. Every item this provider emits has dataStatus
// "demo" — a hard-coded literal, not a passed-in flag, so it cannot
// accidentally be presented as real evidence downstream.
//
// Returns raw content only (no scores, no supportDirection) — those
// are computed uniformly for every provider by evidence-quality.ts and
// evidence-classification.service.ts in evidence-collection.service.ts.
// =====================================================================

import type {
  EvidenceCollectionContext,
  EvidenceProvider,
  RawEvidenceContent,
} from "@/backend/evidence/provider";

export class DemoEvidenceProvider implements EvidenceProvider {
  readonly id = "demo-provider";
  readonly version = "1.1.0";

  isAvailable(): boolean {
    return true;
  }

  async collect(context: EvidenceCollectionContext): Promise<RawEvidenceContent[]> {
    const { requirement } = context;
    const provenance = {
      providerId: this.id,
      providerVersion: this.version,
      collectedBy: "system" as const,
    };

    // Two illustrative items with deliberately different framing, so a
    // demo run also exercises classification and (occasionally)
    // conflict detection rather than always producing one-sided output.
    const positiveLeaning: RawEvidenceContent = {
      hypothesisId: requirement.hypothesisId,
      evidenceRequirementId: requirement.id,
      source: "Illustrative example (demo mode)",
      sourceType: "market_data",
      sourceUrl: null,
      sourceTitle: `Example favorable signal for: ${requirement.evidenceType}`,
      publicationDate: null,
      summary:
        `Demo evidence illustrating a favorable "${requirement.evidenceType}" finding for this requirement — ` +
        `e.g. early interest or a comparable product succeeding in an adjacent segment. This is placeholder ` +
        `content, not a real research result.`,
      provenance,
      dataStatus: "demo",
    };

    const cautionLeaning: RawEvidenceContent = {
      hypothesisId: requirement.hypothesisId,
      evidenceRequirementId: requirement.id,
      source: "Illustrative counter-example (demo mode)",
      sourceType: "competitor",
      sourceUrl: null,
      sourceTitle: `Example cautionary signal for: ${requirement.evidenceType}`,
      publicationDate: null,
      summary:
        `Demo evidence illustrating a less favorable "${requirement.evidenceType}" finding — e.g. an existing ` +
        `competitor struggling with the same assumption. This is placeholder content, not a real research result.`,
      provenance,
      dataStatus: "demo",
    };

    return [positiveLeaning, cautionLeaning];
  }
}
