// =====================================================================
// Project service (Phase 1 foundation; wired up further in Phase 3).
//
// Owns the transaction-shaped operation "create a project from a raw
// business idea submission". Route handlers / server functions should
// call this rather than talking to repositories directly, so the
// create-project-then-create-idea sequence stays in one place.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { RawBusinessIdeaInput, UUID } from "@/lib/types/domain";
import { ProjectRepository } from "@/backend/repositories/project.repository";
import { BusinessIdeaRepository } from "@/backend/repositories/business-idea.repository";
import { logAudit, AUDIT_ACTIONS } from "@/backend/services/audit.service";

export class ProjectService {
  private readonly projects: ProjectRepository;
  private readonly businessIdeas: BusinessIdeaRepository;
  private readonly db: SupabaseClient<Database>;

  constructor(db: SupabaseClient<Database>) {
    this.projects = new ProjectRepository(db);
    this.businessIdeas = new BusinessIdeaRepository(db);
    this.db = db;
  }

  async createProjectWithIdea(userId: UUID, raw: RawBusinessIdeaInput) {
    const project = await this.projects.create(userId, raw.businessName);
    const businessIdea = await this.businessIdeas.create(project.id, raw);

    await logAudit(this.db, {
      userId,
      projectId: project.id,
      action: AUDIT_ACTIONS.PROJECT_CREATED,
      entityType: "project",
      entityId: project.id,
      metadata: { businessIdeaId: businessIdea.id },
    });

    // Idea structuring (Phase 4) is kicked off by the analysis job, not
    // here — creating a project should stay fast and not block on an
    // LLM call.
    return { project, businessIdea };
  }

  async listProjectsForUser(userId: UUID) {
    return this.projects.listByUser(userId);
  }
}
