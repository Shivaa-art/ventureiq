// =====================================================================
// Usage tracking (Phase 7, Steps 11 & 12).
//
// Counts are computed live from existing rows (projects, research_runs,
// research_sources, validation_actions) rather than maintained in a
// separate mutable counter table — the same derive-don't-duplicate
// principle as project-status.ts, avoiding a second source of truth
// that could drift.
//
// No payment integration exists yet (Phase 7, Step 12 explicitly defers
// this) — PLAN_LIMITS is a configuration table only, never asserted as
// enforced billing.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { PlanTier, UsageLimits, UsageSnapshot, UUID } from "@/lib/types/domain";

export const PLAN_LIMITS: Record<PlanTier, UsageLimits> = {
  free: { projects: 2, researchRunsPerMonth: 5 },
  pro: { projects: 10, researchRunsPerMonth: 30 },
  enterprise: { projects: null, researchRunsPerMonth: null },
};

export class UsageService {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async getUsage(userId: UUID): Promise<UsageSnapshot> {
    const { data: userRow, error: userError } = await this.db
      .from("users")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();
    if (userError) throw userError;
    const plan = userRow?.plan ?? "free";
    const limits = PLAN_LIMITS[plan];

    const { count: projectCount, error: projectsError } = await this.db
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (projectsError) throw projectsError;

    // research_runs/research_sources/validation_actions don't carry
    // user_id directly (they're scoped via hypothesis -> business_idea
    // -> project -> user, same as everywhere else) — RLS already
    // restricts these queries to the current user's own rows when using
    // the request-scoped client, so a plain count is safe and correct
    // here without an explicit join filter.
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const { count: researchRunsThisMonth, error: runsError } = await this.db
      .from("research_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString());
    if (runsError) throw runsError;

    const { count: researchSourcesCount, error: sourcesError } = await this.db
      .from("research_sources")
      .select("id", { count: "exact", head: true });
    if (sourcesError) throw sourcesError;

    const { count: validationActionsCount, error: actionsError } = await this.db
      .from("validation_actions")
      .select("id", { count: "exact", head: true });
    if (actionsError) throw actionsError;

    const projects = projectCount ?? 0;
    const researchRuns = researchRunsThisMonth ?? 0;

    return {
      plan,
      limits,
      current: {
        projects,
        researchRuns,
        researchSources: researchSourcesCount ?? 0,
        validationActionsRecorded: validationActionsCount ?? 0,
      },
      remaining: {
        projects: limits.projects == null ? null : Math.max(0, limits.projects - projects),
        researchRunsThisMonth:
          limits.researchRunsPerMonth == null
            ? null
            : Math.max(0, limits.researchRunsPerMonth - researchRuns),
      },
    };
  }
}
