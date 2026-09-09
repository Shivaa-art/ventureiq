// =====================================================================
// Research API (Phase 6, Steps 12-14).
//
// Every handler uses the request-scoped, RLS-respecting Supabase
// client — a founder can only ever research/review evidence for
// hypotheses that belong to their own projects, enforced by Postgres
// RLS (migration 0005).
// =====================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient } from "@/backend/auth/supabase-server-client";
import { requireServerUser } from "@/backend/auth/session";
import { ResearchService } from "@/backend/services/research.service";
import { logAudit, AUDIT_ACTIONS } from "@/backend/services/audit.service";
import { EvidenceReviewDecisionSchema } from "@/lib/types/schemas";

const hypothesisIdSchema = z.object({ hypothesisId: z.string().uuid() });

export const getResearchWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => hypothesisIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ResearchService(db);
    return service.getResearchWorkspace(data.hypothesisId);
  });

export const startResearch = createServerFn({ method: "POST" })
  .validator((data: unknown) => hypothesisIdSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ResearchService(db);
    const runId = await service.startResearchRun(data.hypothesisId);
    await logAudit(db, {
      userId: user.id,
      action: AUDIT_ACTIONS.RESEARCH_STARTED,
      entityType: "hypothesis",
      entityId: data.hypothesisId,
      metadata: { runId },
    });
    const workspace = await service.getResearchWorkspace(data.hypothesisId);
    const latestRun = workspace.runs.find((r) => r.id === runId);
    if (latestRun && (latestRun.status === "completed" || latestRun.status === "partial")) {
      await logAudit(db, {
        userId: user.id,
        action: AUDIT_ACTIONS.RESEARCH_COMPLETED,
        entityType: "research_run",
        entityId: runId,
        metadata: { status: latestRun.status, sourceCount: latestRun.sourceCount },
      });
    }
    return { runId, workspace };
  });

const reviewEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
  decision: EvidenceReviewDecisionSchema,
});

const REVIEW_AUDIT_ACTION = {
  accepted: AUDIT_ACTIONS.EVIDENCE_ACCEPTED,
  rejected: AUDIT_ACTIONS.EVIDENCE_REJECTED,
  flagged: AUDIT_ACTIONS.EVIDENCE_FLAGGED,
} as const;

export const reviewResearchEvidence = createServerFn({ method: "POST" })
  .validator((data: unknown) => reviewEvidenceSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ResearchService(db);
    const result = await service.reviewEvidence(data.evidenceId, data.decision);
    await logAudit(db, {
      userId: user.id,
      action: REVIEW_AUDIT_ACTION[data.decision],
      entityType: "evidence",
      entityId: data.evidenceId,
    });
    return result;
  });
