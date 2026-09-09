import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { Hypothesis, HypothesisStatus, ThresholdType, UUID } from "@/lib/types/domain";

type Row = Database["public"]["Tables"]["hypotheses"]["Row"];

function toDomain(row: Row): Hypothesis {
  return {
    id: row.id,
    businessIdeaId: row.business_idea_id,
    assumptionId: row.assumption_id,
    statement: row.statement,
    category: row.category as Hypothesis["category"],
    importance: row.importance,
    validationCriteria: row.validation_criteria,
    threshold: row.threshold,
    thresholdType: row.threshold_type,
    status: row.status,
    confidence: Number(row.confidence),
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * What the repository needs to insert a hypothesis — the LLM-facing
 * GeneratedHypothesisSchema shape, but with assumptionIndex already
 * resolved to a real assumption UUID (or null) by the calling service,
 * since the repository has no knowledge of the in-flight generation
 * batch's array ordering.
 */
export interface HypothesisInsertInput {
  statement: string;
  category: Hypothesis["category"];
  importance: Hypothesis["importance"];
  validationCriteria: string;
  threshold?: string | null;
  thresholdType?: ThresholdType | null;
  assumptionId?: UUID | null;
}

export interface HypothesisEditableFields {
  statement?: string;
  category?: Hypothesis["category"];
  importance?: Hypothesis["importance"];
  validationCriteria?: string;
  threshold?: string | null;
  thresholdType?: ThresholdType | null;
}

export class HypothesisRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * Bulk-insert freshly generated hypotheses. Status is always forced
   * to "untested" and confidence to 0 here — regardless of what the
   * LLM-facing GeneratedHypothesis shape contains — because those two
   * fields are schema-excluded from GeneratedHypothesisSchema and must
   * only ever be advanced by the Confidence Engine (Phase 12).
   */
  async createMany(
    businessIdeaId: UUID,
    hypotheses: HypothesisInsertInput[],
  ): Promise<Hypothesis[]> {
    const rows = hypotheses.map((h, i) => ({
      business_idea_id: businessIdeaId,
      assumption_id: h.assumptionId ?? null,
      statement: h.statement,
      category: h.category,
      importance: h.importance,
      validation_criteria: h.validationCriteria,
      threshold: h.threshold ?? null,
      threshold_type: h.thresholdType ?? null,
      status: "untested" as const,
      confidence: 0,
      display_order: i,
    }));
    const { data, error } = await this.db.from("hypotheses").insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async listByBusinessIdea(businessIdeaId: UUID): Promise<Hypothesis[]> {
    const { data, error } = await this.db
      .from("hypotheses")
      .select()
      .eq("business_idea_id", businessIdeaId)
      .order("display_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async getById(id: UUID): Promise<Hypothesis | null> {
    const { data, error } = await this.db.from("hypotheses").select().eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  /**
   * Founder edits from the Step 8 plan-review screen — statement,
   * category, importance, validation criteria, and threshold/type are
   * all editable before approval. Status/confidence are never touched
   * here; see updateStatusAndConfidence.
   */
  async updateEditableFields(id: UUID, fields: HypothesisEditableFields): Promise<Hypothesis> {
    const patch: Database["public"]["Tables"]["hypotheses"]["Update"] = {};
    if (fields.statement !== undefined) patch.statement = fields.statement;
    if (fields.category !== undefined) patch.category = fields.category;
    if (fields.importance !== undefined) patch.importance = fields.importance;
    if (fields.validationCriteria !== undefined)
      patch.validation_criteria = fields.validationCriteria;
    if (fields.threshold !== undefined) patch.threshold = fields.threshold;
    if (fields.thresholdType !== undefined) patch.threshold_type = fields.thresholdType;

    // A founder-edited threshold is no longer purely AI-proposed.
    if (fields.threshold !== undefined && fields.thresholdType === undefined) {
      patch.threshold_type = "user_defined";
    }

    const { data, error } = await this.db
      .from("hypotheses")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }

  async delete(id: UUID): Promise<void> {
    const { error } = await this.db.from("hypotheses").delete().eq("id", id);
    if (error) throw error;
  }

  /**
   * The only place hypothesis status/confidence should be written after
   * creation — called exclusively by the Confidence Engine, never by an
   * LLM-facing code path.
   */
  async updateStatusAndConfidence(
    id: UUID,
    status: HypothesisStatus,
    confidence: number,
  ): Promise<Hypothesis> {
    const { data, error } = await this.db
      .from("hypotheses")
      .update({ status, confidence })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }
}
