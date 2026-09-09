import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { UserProfile, UUID } from "@/lib/types/domain";

type Row = Database["public"]["Tables"]["users"]["Row"];

function toDomain(row: Row): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    plan: row.plan,
    subscriptionStatus: row.subscription_status,
    subscriptionProvider: row.subscription_provider,
    subscriptionId: row.subscription_id,
    createdAt: row.created_at,
  };
}

export class UserRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getById(id: UUID): Promise<UserProfile | null> {
    const { data, error } = await this.db.from("users").select().eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toDomain(data) : null;
  }
}
