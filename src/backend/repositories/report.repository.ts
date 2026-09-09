import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { ReportSnapshot, UUID } from "@/lib/types/domain";

export class ReportRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async save(businessIdeaId: UUID, userId: UUID, snapshot: ReportSnapshot): Promise<UUID> {
    const { data, error } = await this.db
      .from("reports")
      .insert({
        business_idea_id: businessIdeaId,
        user_id: userId,
        snapshot: snapshot as unknown as Record<string, unknown>,
        is_demo: snapshot.isDemo,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async getById(id: UUID): Promise<ReportSnapshot | null> {
    const { data, error } = await this.db
      .from("reports")
      .select("snapshot")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? (data.snapshot as unknown as ReportSnapshot) : null;
  }
}

export class ActivityLogRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async log(
    eventType: string,
    payload: Record<string, unknown>,
    opts?: { userId?: UUID; projectId?: UUID },
  ): Promise<void> {
    const { error } = await this.db.from("activity_logs").insert({
      event_type: eventType,
      payload,
      user_id: opts?.userId ?? null,
      project_id: opts?.projectId ?? null,
    });
    if (error) throw error;
  }
}
