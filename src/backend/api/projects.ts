// =====================================================================
// Project creation API (Phase 3, Step 1).
//
// Uses the request-scoped, RLS-respecting Supabase client (the same
// one auth uses) rather than the service-role client — project
// creation is an ordinary user-owned write and should go through RLS
// like any other, not bypass it.
// =====================================================================

import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClient } from "@/backend/auth/supabase-server-client";
import { requireServerUser } from "@/backend/auth/session";
import { ProjectService } from "@/backend/services/project.service";
import { RawBusinessIdeaInputSchema } from "@/lib/types/schemas";

export const createProject = createServerFn({ method: "POST" })
  .validator((data: unknown) => RawBusinessIdeaInputSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ProjectService(db);
    const { project, businessIdea } = await service.createProjectWithIdea(user.id, data);
    return { projectId: project.id, businessIdeaId: businessIdea.id };
  });

export const listMyProjects = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireServerUser();
  const db = getSupabaseServerClient();
  const service = new ProjectService(db);
  return service.listProjectsForUser(user.id);
});
