// =====================================================================
// UserEvidenceProvider (Phase 8; expanded Phase 4).
//
// Shapes a founder's manually-submitted evidence (Phase 4, Step 2:
// title, description, source, URL, evidence type, date, notes, and an
// explicit SUPPORTS/CONTRADICTS/NEUTRAL label the founder chooses
// themselves) into the same RawEvidenceContent shape every other
// provider produces, always tagged dataStatus "user_provided".
//
// Unlike other providers, this one is not "collected" by calling out
// to anything — the caller passes the raw submission in. The founder's
// own supportDirection is authoritative and is carried alongside the
// content (not discarded the way a provider's guess would be); see
// evidence-collection.service.ts, which skips the LLM classifier
// entirely for user-provided evidence and uses this label as-is.
// =====================================================================

import type {
  EvidenceCollectionContext,
  EvidenceProvider,
  RawEvidenceContent,
} from "@/backend/evidence/provider";
import type { SupportDirection, UUID } from "@/lib/types/domain";
import type { SourceType } from "@/lib/types/domain";

export interface UserEvidenceSubmission {
  hypothesisId: UUID;
  evidenceRequirementId?: UUID | null;
  title: string;
  description: string;
  source: string;
  sourceUrl?: string | null;
  evidenceType: SourceType;
  publicationDate?: string | null;
  notes?: string | null;
  supportDirection: SupportDirection;
}

export class UserEvidenceProvider implements EvidenceProvider {
  readonly id = "user-provider";
  readonly version = "1.1.0";

  isAvailable(): boolean {
    return true;
  }

  /** Not used for automated collection — user evidence arrives via submit(). */
  async collect(_context: EvidenceCollectionContext): Promise<RawEvidenceContent[]> {
    return [];
  }

  submit(input: UserEvidenceSubmission): {
    content: RawEvidenceContent;
    supportDirection: SupportDirection;
    notes: string | null;
  } {
    const content: RawEvidenceContent = {
      hypothesisId: input.hypothesisId,
      evidenceRequirementId: input.evidenceRequirementId ?? null,
      source: input.source,
      sourceType: input.evidenceType,
      sourceUrl: input.sourceUrl ?? null,
      sourceTitle: input.title,
      publicationDate: input.publicationDate ?? null,
      summary: input.description,
      provenance: { providerId: this.id, providerVersion: this.version, collectedBy: "user" },
      dataStatus: "user_provided",
    };
    return { content, supportDirection: input.supportDirection, notes: input.notes ?? null };
  }
}
