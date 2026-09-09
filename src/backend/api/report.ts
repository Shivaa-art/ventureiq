// =====================================================================
// Report & Sharing API (Phase 7, Steps 3, 6).
//
// getProjectReport requires auth + RLS ownership like every other
// project-scoped endpoint. getSharedReport is the one deliberately
// public, unauthenticated endpoint in the app — it never touches the
// RLS-respecting client, only ReportService's narrow service-role
// share-token lookup.
// =====================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient } from "@/backend/auth/supabase-server-client";
import { requireServerUser } from "@/backend/auth/session";
import { ReportService } from "@/backend/services/report.service";
import { logAudit, AUDIT_ACTIONS } from "@/backend/services/audit.service";

const businessIdeaIdSchema = z.object({ businessIdeaId: z.string().uuid() });

export const getProjectReport = createServerFn({ method: "GET" })
  .validator((data: unknown) => businessIdeaIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ReportService(db);
    return service.buildReport(data.businessIdeaId);
  });

export const createShareLink = createServerFn({ method: "POST" })
  .validator((data: unknown) => businessIdeaIdSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ReportService(db);
    const businessIdea = await service.createShareLink(data.businessIdeaId);
    await logAudit(db, {
      userId: user.id,
      action: AUDIT_ACTIONS.SHARE_LINK_CREATED,
      entityType: "business_idea",
      entityId: data.businessIdeaId,
    });
    return businessIdea;
  });

export const disableShareLink = createServerFn({ method: "POST" })
  .validator((data: unknown) => businessIdeaIdSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ReportService(db);
    const businessIdea = await service.disableShareLink(data.businessIdeaId);
    await logAudit(db, {
      userId: user.id,
      action: AUDIT_ACTIONS.SHARE_LINK_DISABLED,
      entityType: "business_idea",
      entityId: data.businessIdeaId,
    });
    return businessIdea;
  });

/**
 * No auth check here by design — this is the public share endpoint.
 * Security comes entirely from the unguessable token +
 * share_enabled = true (see ReportService.getSharedReport).
 */
export const getSharedReport = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ token: z.string().min(10).max(100) }).parse(data))
  .handler(async ({ data }) => {
    return ReportService.getSharedReport(data.token);
  });
