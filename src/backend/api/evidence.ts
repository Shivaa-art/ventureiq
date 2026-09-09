// =====================================================================
// Evidence API (Phase 4, Steps 12-14).
//
// Every handler uses the request-scoped, RLS-respecting Supabase
// client — a founder can only ever add/edit/delete/collect/re-evaluate
// evidence on hypotheses that belong to their own projects, enforced
// by Postgres RLS, not by an application-level ownership check alone.
// =====================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient } from "@/backend/auth/supabase-server-client";
import { requireServerUser } from "@/backend/auth/session";
import { EvidenceCollectionService } from "@/backend/services/evidence-collection.service";
import { logAudit, AUDIT_ACTIONS } from "@/backend/services/audit.service";
import { EvidenceRepository } from "@/backend/repositories/evidence.repository";
import { ConflictGapRepository } from "@/backend/repositories/conflict-gap.repository";
import { SourceTypeSchema, SupportDirectionSchema } from "@/lib/types/schemas";

const hypothesisIdSchema = z.object({ hypothesisId: z.string().uuid() });

export const getEvidenceWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => hypothesisIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new EvidenceCollectionService(db);
    return service.getWorkspace(data.hypothesisId);
  });

const addUserEvidenceSchema = z.object({
  hypothesisId: z.string().uuid(),
  evidenceRequirementId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300),
  description: z.string().min(10).max(1000),
  source: z.string().min(1).max(300),
  sourceUrl: z.string().url().nullable().optional(),
  evidenceType: SourceTypeSchema,
  publicationDate: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  supportDirection: SupportDirectionSchema,
});

export const addUserEvidence = createServerFn({ method: "POST" })
  .validator((data: unknown) => addUserEvidenceSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new EvidenceCollectionService(db);
    const result = await service.addUserEvidence(data);
    await logAudit(db, {
      userId: user.id,
      action: AUDIT_ACTIONS.EVIDENCE_ADDED,
      entityType: "hypothesis",
      entityId: data.hypothesisId,
    });
    return result;
  });

export const collectDemoEvidence = createServerFn({ method: "POST" })
  .validator((data: unknown) => hypothesisIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new EvidenceCollectionService(db);
    return service.collectDemoEvidence(data.hypothesisId);
  });

export const reevaluateEvidence = createServerFn({ method: "POST" })
  .validator((data: unknown) => hypothesisIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new EvidenceCollectionService(db);
    return service.reevaluate(data.hypothesisId);
  });

const updateEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
  sourceTitle: z.string().max(300).nullable().optional(),
  summary: z.string().min(10).max(1000).optional(),
  notes: z.string().max(2000).nullable().optional(),
  source: z.string().min(1).max(300).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  publicationDate: z.string().nullable().optional(),
  supportDirection: SupportDirectionSchema.optional(),
});

export const updateEvidence = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateEvidenceSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new EvidenceCollectionService(db);
    const { evidenceId, ...fields } = data;
    return service.updateEvidence(evidenceId, fields);
  });

export const deleteEvidence = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ evidenceId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new EvidenceCollectionService(db);
    return service.deleteEvidence(data.evidenceId);
  });

/** Bulk view for the plan-wide evidence overview (one call per hypothesis, batched). */
export const getEvidenceOverview = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ hypothesisIds: z.array(z.string().uuid()) }).parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const evidenceRepo = new EvidenceRepository(db);
    const conflictGapRepo = new ConflictGapRepository(db);

    const [evidenceByHypothesis, conflicts, gaps] = await Promise.all([
      evidenceRepo.listByHypotheses(data.hypothesisIds),
      conflictGapRepo.listConflictsByHypotheses(data.hypothesisIds),
      conflictGapRepo.listGapsByHypotheses(data.hypothesisIds),
    ]);

    const coverageByHypothesis: Record<
      string,
      Awaited<ReturnType<typeof evidenceRepo.getCoverage>>
    > = {};
    for (const id of data.hypothesisIds) {
      coverageByHypothesis[id] = await evidenceRepo.getCoverage(id);
    }

    return { evidenceByHypothesis, coverageByHypothesis, conflicts, gaps };
  });
