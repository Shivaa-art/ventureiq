import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  Evidence,
  EvidenceCoverage,
  EvidenceRelationship,
  EvidenceRelationshipType,
  EvidenceRequirement,
  EvidenceProvenance,
  UUID,
} from "@/lib/types/domain";
import type { EvidenceItemSchema, GeneratedEvidenceRequirementSchema } from "@/lib/types/schemas";
import type { z } from "zod";

type RequirementRow = Database["public"]["Tables"]["evidence_requirements"]["Row"];
type EvidenceRow = Database["public"]["Tables"]["evidence"]["Row"];
type RelationshipRow = Database["public"]["Tables"]["evidence_relationships"]["Row"];

type GeneratedRequirement = z.infer<typeof GeneratedEvidenceRequirementSchema>;
type EvidenceItemInput = z.infer<typeof EvidenceItemSchema>;

function requirementToDomain(row: RequirementRow): EvidenceRequirement {
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    evidenceType: row.evidence_type,
    description: row.description,
    importance: row.importance,
    minimumEvidenceLevel: row.minimum_evidence_level,
    preferredSources: row.preferred_sources,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function evidenceToDomain(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    evidenceRequirementId: row.evidence_requirement_id,
    source: row.source,
    sourceType: row.source_type as Evidence["sourceType"],
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    publicationDate: row.publication_date,
    retrievalDate: row.retrieval_date,
    summary: row.summary,
    notes: row.notes,
    supportDirection: row.support_direction,
    reliabilityScore: Number(row.reliability_score),
    relevanceScore: Number(row.relevance_score),
    recencyScore: Number(row.recency_score),
    independenceScore: Number(row.independence_score),
    confidenceScore: Number(row.confidence_score),
    classificationReason: row.classification_reason,
    provenance: row.provenance as unknown as EvidenceProvenance,
    dataStatus: row.data_status,
    sourceFingerprint: row.source_fingerprint,
    reviewStatus: row.review_status,
    researchSourceId: row.research_source_id,
    createdAt: row.created_at,
  };
}

function relationshipToDomain(row: RelationshipRow): EvidenceRelationship {
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    evidenceId: row.evidence_id,
    relatedEvidenceId: row.related_evidence_id,
    relationshipType: row.relationship_type as EvidenceRelationshipType,
    classificationConfidence: row.classification_confidence,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export class EvidenceRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // -- Evidence requirements -------------------------------------------------

  async createRequirements(
    hypothesisId: UUID,
    requirements: GeneratedRequirement[],
  ): Promise<EvidenceRequirement[]> {
    const rows = requirements.map((r) => ({
      hypothesis_id: hypothesisId,
      evidence_type: r.evidenceType,
      description: r.description,
      importance: r.importance,
      minimum_evidence_level: r.minimumEvidenceLevel,
      preferred_sources: r.preferredSources,
      status: "open" as const,
    }));
    const { data, error } = await this.db.from("evidence_requirements").insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(requirementToDomain);
  }

  async listRequirementsByHypothesis(hypothesisId: UUID): Promise<EvidenceRequirement[]> {
    const { data, error } = await this.db
      .from("evidence_requirements")
      .select()
      .eq("hypothesis_id", hypothesisId);
    if (error) throw error;
    return (data ?? []).map(requirementToDomain);
  }

  async listRequirementsByHypotheses(
    hypothesisIds: UUID[],
  ): Promise<Record<UUID, EvidenceRequirement[]>> {
    if (hypothesisIds.length === 0) return {};
    const { data, error } = await this.db
      .from("evidence_requirements")
      .select()
      .in("hypothesis_id", hypothesisIds);
    if (error) throw error;
    const grouped: Record<UUID, EvidenceRequirement[]> = {};
    for (const row of data ?? []) {
      const item = requirementToDomain(row);
      (grouped[item.hypothesisId] ??= []).push(item);
    }
    return grouped;
  }

  async updateRequirementFields(
    id: UUID,
    fields: {
      description?: string;
      importance?: EvidenceRequirement["importance"];
      minimumEvidenceLevel?: EvidenceRequirement["minimumEvidenceLevel"];
    },
  ): Promise<EvidenceRequirement> {
    const patch: Database["public"]["Tables"]["evidence_requirements"]["Update"] = {};
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.importance !== undefined) patch.importance = fields.importance;
    if (fields.minimumEvidenceLevel !== undefined)
      patch.minimum_evidence_level = fields.minimumEvidenceLevel;

    const { data, error } = await this.db
      .from("evidence_requirements")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return requirementToDomain(data);
  }

  async deleteRequirement(id: UUID): Promise<void> {
    const { error } = await this.db.from("evidence_requirements").delete().eq("id", id);
    if (error) throw error;
  }

  // -- Evidence items ----------------------------------------------------------

  async createEvidence(items: EvidenceItemInput[]): Promise<Evidence[]> {
    if (items.length === 0) return [];
    const rows = items.map((e) => ({
      hypothesis_id: e.hypothesisId,
      evidence_requirement_id: e.evidenceRequirementId ?? null,
      source: e.source,
      source_type: e.sourceType,
      source_url: e.sourceUrl ?? null,
      source_title: e.sourceTitle ?? null,
      publication_date: e.publicationDate ?? null,
      summary: e.summary,
      notes: e.notes ?? null,
      support_direction: e.supportDirection,
      reliability_score: e.reliabilityScore,
      relevance_score: e.relevanceScore,
      recency_score: e.recencyScore,
      independence_score: e.independenceScore,
      confidence_score: e.confidenceScore,
      classification_reason: e.classificationReason ?? null,
      provenance: e.provenance,
      data_status: e.dataStatus,
      source_fingerprint: e.sourceFingerprint ?? null,
      review_status: e.reviewStatus ?? "accepted",
      research_source_id: e.researchSourceId ?? null,
    }));
    const { data, error } = await this.db.from("evidence").insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(evidenceToDomain);
  }

  async getById(id: UUID): Promise<Evidence | null> {
    const { data, error } = await this.db.from("evidence").select().eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? evidenceToDomain(data) : null;
  }

  async updateEditableFields(
    id: UUID,
    fields: {
      sourceTitle?: string | null;
      summary?: string;
      notes?: string | null;
      source?: string;
      sourceUrl?: string | null;
      publicationDate?: string | null;
      supportDirection?: Evidence["supportDirection"];
    },
  ): Promise<Evidence> {
    const patch: Database["public"]["Tables"]["evidence"]["Update"] = {};
    if (fields.sourceTitle !== undefined) patch.source_title = fields.sourceTitle;
    if (fields.summary !== undefined) patch.summary = fields.summary;
    if (fields.notes !== undefined) patch.notes = fields.notes;
    if (fields.source !== undefined) patch.source = fields.source;
    if (fields.sourceUrl !== undefined) patch.source_url = fields.sourceUrl;
    if (fields.publicationDate !== undefined) patch.publication_date = fields.publicationDate;
    if (fields.supportDirection !== undefined) patch.support_direction = fields.supportDirection;

    const { data, error } = await this.db
      .from("evidence")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return evidenceToDomain(data);
  }

  async delete(id: UUID): Promise<void> {
    const { error } = await this.db.from("evidence").delete().eq("id", id);
    if (error) throw error;
  }

  /** Human review gate (Phase 6, Step 11) — only "accepted" evidence participates fully in scoring. */
  async updateReviewStatus(id: UUID, reviewStatus: Evidence["reviewStatus"]): Promise<Evidence> {
    const { data, error } = await this.db
      .from("evidence")
      .update({ review_status: reviewStatus })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return evidenceToDomain(data);
  }

  async listByHypothesis(hypothesisId: UUID): Promise<Evidence[]> {
    const { data, error } = await this.db
      .from("evidence")
      .select()
      .eq("hypothesis_id", hypothesisId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(evidenceToDomain);
  }

  async listByHypotheses(hypothesisIds: UUID[]): Promise<Record<UUID, Evidence[]>> {
    if (hypothesisIds.length === 0) return {};
    const { data, error } = await this.db
      .from("evidence")
      .select()
      .in("hypothesis_id", hypothesisIds);
    if (error) throw error;
    const grouped: Record<UUID, Evidence[]> = {};
    for (const row of data ?? []) {
      const item = evidenceToDomain(row);
      (grouped[item.hypothesisId] ??= []).push(item);
    }
    return grouped;
  }

  // -- Relationships -------------------------------------------------------------

  async createRelationships(
    relationships: Array<{
      hypothesisId: UUID;
      evidenceId: UUID;
      relatedEvidenceId?: UUID | null;
      relationshipType: EvidenceRelationshipType;
      classificationConfidence?: number | null;
      reason?: string | null;
    }>,
  ): Promise<EvidenceRelationship[]> {
    if (relationships.length === 0) return [];
    const rows = relationships.map((r) => ({
      hypothesis_id: r.hypothesisId,
      evidence_id: r.evidenceId,
      related_evidence_id: r.relatedEvidenceId ?? null,
      relationship_type: r.relationshipType,
      classification_confidence: r.classificationConfidence ?? null,
      reason: r.reason ?? null,
    }));
    const { data, error } = await this.db.from("evidence_relationships").insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(relationshipToDomain);
  }

  async listRelationshipsByHypothesis(hypothesisId: UUID): Promise<EvidenceRelationship[]> {
    const { data, error } = await this.db
      .from("evidence_relationships")
      .select()
      .eq("hypothesis_id", hypothesisId);
    if (error) throw error;
    return (data ?? []).map(relationshipToDomain);
  }

  /**
   * Deterministic coverage calculation from stored evidence + requirement
   * counts — not an LLM judgment call. Used by the Confidence Engine and
   * the report UI.
   */
  async getCoverage(hypothesisId: UUID): Promise<EvidenceCoverage> {
    const [{ data: evidenceRows, error: evidenceError }, { data: reqRows, error: reqError }] =
      await Promise.all([
        this.db.from("evidence").select("support_direction").eq("hypothesis_id", hypothesisId),
        this.db.from("evidence_requirements").select("status").eq("hypothesis_id", hypothesisId),
      ]);
    if (evidenceError) throw evidenceError;
    if (reqError) throw reqError;

    const supportingCount = (evidenceRows ?? []).filter(
      (r) => r.support_direction === "supports",
    ).length;
    const contradictingCount = (evidenceRows ?? []).filter(
      (r) => r.support_direction === "contradicts",
    ).length;
    const neutralCount = (evidenceRows ?? []).filter(
      (r) => r.support_direction === "neutral",
    ).length;

    const totalRequirements = (reqRows ?? []).length;
    const metRequirements = (reqRows ?? []).filter((r) => r.status === "met").length;
    const coveragePct =
      totalRequirements === 0 ? 0 : Math.round((metRequirements / totalRequirements) * 100);

    return { hypothesisId, supportingCount, contradictingCount, neutralCount, coveragePct };
  }
}
