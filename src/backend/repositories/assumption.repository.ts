import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { AssumptionSource, BusinessAssumption, Importance, UUID } from "@/lib/types/domain";

type Row = Database["public"]["Tables"]["business_assumptions"]["Row"];

function toDomain(row: Row): BusinessAssumption {
  return {
    id: row.id,
    businessIdeaId: row.business_idea_id,
    statement: row.statement,
    category: row.category,
    importance: row.importance,
    source: row.source,
    status: row.status,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface AssumptionInsertInput {
  statement: string;
  category: string;
  importance: Importance;
  source: AssumptionSource;
}

export class AssumptionRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async createMany(
    businessIdeaId: UUID,
    assumptions: AssumptionInsertInput[],
  ): Promise<BusinessAssumption[]> {
    const rows = assumptions.map((a, i) => ({
      business_idea_id: businessIdeaId,
      statement: a.statement,
      category: a.category,
      importance: a.importance,
      source: a.source,
      status: "active" as const,
      display_order: i,
    }));
    const { data, error } = await this.db.from("business_assumptions").insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async listByBusinessIdea(businessIdeaId: UUID): Promise<BusinessAssumption[]> {
    const { data, error } = await this.db
      .from("business_assumptions")
      .select()
      .eq("business_idea_id", businessIdeaId)
      .eq("status", "active")
      .order("display_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async getById(id: UUID): Promise<BusinessAssumption | null> {
    const { data, error } = await this.db
      .from("business_assumptions")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async updateEditableFields(
    id: UUID,
    fields: { statement?: string; category?: string; importance?: Importance },
  ): Promise<BusinessAssumption> {
    const { data, error } = await this.db
      .from("business_assumptions")
      .update(fields)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }

  /** Soft-delete: keeps the row (and any hypotheses that trace back to it) but excludes it from the active plan. */
  async remove(id: UUID): Promise<void> {
    const { error } = await this.db
      .from("business_assumptions")
      .update({ status: "removed" })
      .eq("id", id);
    if (error) throw error;
  }
}
