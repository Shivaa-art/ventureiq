// =====================================================================
// evidence-normalization.service.ts (Phase 4, Step 4).
//
// Converts RawEvidenceContent + a resolved classification into the
// fully-scored EvidenceItemDraft shape the repository persists.
// Assembles, never invents: provenance passed in from the provider is
// carried through unchanged (never overwritten — see the file-level
// note in provider.ts), and the four quality scores come from the
// deterministic functions in evidence-quality.ts, not from this
// function's own judgment.
// =====================================================================

import { EvidenceItemSchema } from "@/lib/types/schemas";
import type { EvidenceItemDraft, RawEvidenceContent } from "@/backend/evidence/provider";
import {
  independenceScore as computeIndependence,
  recencyScore as computeRecency,
  relevanceScore as computeRelevance,
  reliabilityScore as computeReliability,
} from "@/backend/evidence/evidence-quality";
import type { SupportDirection } from "@/lib/types/domain";

export interface NormalizeEvidenceInput {
  content: RawEvidenceContent;
  supportDirection: SupportDirection;
  classificationConfidence: number; // 0-100
  classificationReason: string | null;
  notes?: string | null;
}

export function normalizeEvidence(input: NormalizeEvidenceInput): EvidenceItemDraft {
  const { content } = input;

  const draft: EvidenceItemDraft = {
    hypothesisId: content.hypothesisId,
    evidenceRequirementId: content.evidenceRequirementId,
    source: content.source,
    sourceType: content.sourceType,
    sourceUrl: content.sourceUrl,
    sourceTitle: content.sourceTitle,
    publicationDate: content.publicationDate,
    summary: content.summary,
    notes: input.notes ?? null,
    supportDirection: input.supportDirection,

    reliabilityScore: computeReliability(content.sourceType, content.dataStatus),
    relevanceScore: computeRelevance({
      hasRequirementLink: content.evidenceRequirementId != null,
      evidenceTypeKeyword: content.sourceType,
      summary: content.summary,
    }),
    recencyScore: computeRecency(content.publicationDate),
    independenceScore: computeIndependence(content.sourceType, content.dataStatus),
    confidenceScore: input.classificationConfidence,
    classificationReason: input.classificationReason,

    // Provenance is carried through exactly as the provider produced it
    // — never overwritten, never re-derived.
    provenance: content.provenance,
    dataStatus: content.dataStatus,
  };

  // Validate the fully-assembled object before it can reach a
  // repository insert — the same choke-point discipline as every
  // LLM-facing schema in this codebase, applied here to the
  // deterministic assembly path too.
  return EvidenceItemSchema.parse(draft);
}
