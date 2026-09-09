import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClient } from "@/backend/auth/supabase-server-client";
import { requireServerUser } from "@/backend/auth/session";
import { DashboardService } from "@/backend/services/dashboard.service";
import { UsageService } from "@/backend/services/usage.service";
import { UserRepository } from "@/backend/repositories/user.repository";

export const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireServerUser();
  const db = getSupabaseServerClient();
  const service = new DashboardService(db);
  return service.getDashboardData(user.id);
});

export const getUsageSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireServerUser();
  const db = getSupabaseServerClient();
  const service = new UsageService(db);
  return service.getUsage(user.id);
});

export const getMyProfile = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireServerUser();
  const db = getSupabaseServerClient();
  const repo = new UserRepository(db);
  return repo.getById(user.id);
});
