import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { Project, ProjectStatus, UUID } from "@/lib/types/domain";

type Row = Database["public"]["Tables"]["projects"]["Row"];

function toDomain(row: Row): Project {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async create(userId: UUID, name: string): Promise<Project> {
    const { data, error } = await this.db
      .from("projects")
      .insert({ user_id: userId, name })
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }

  async getById(id: UUID): Promise<Project | null> {
    const { data, error } = await this.db.from("projects").select().eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async listByUser(userId: UUID): Promise<Project[]> {
    const { data, error } = await this.db
      .from("projects")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async updateStatus(id: UUID, status: ProjectStatus): Promise<Project> {
    const { data, error } = await this.db
      .from("projects")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }
}
