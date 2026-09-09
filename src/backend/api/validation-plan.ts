// =====================================================================
// Validation Plan API (Phase 3, Steps 2-8).
//
// Every handler here uses the request-scoped, RLS-respecting Supabase
// client — a founder can only ever run/read/edit/approve their own
// business idea's plan, enforced by Postgres RLS (see migration 0001),
// not by application-level ownership checks alone.
// =====================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient } from "@/backend/auth/supabase-server-client";
import { requireServerUser } from "@/backend/auth/session";
import { ValidationPlanService } from "@/backend/services/validation-plan.service";
import { logAudit, AUDIT_ACTIONS } from "@/backend/services/audit.service";
import {
  ImportanceSchema,
  MinimumEvidenceLevelSchema,
  ThresholdTypeSchema,
} from "@/lib/types/schemas";
import { HypothesisRepository } from "@/backend/repositories/hypothesis.repository";
import { EvidenceRepository } from "@/backend/repositories/evidence.repository";
import { AssumptionRepository } from "@/backend/repositories/assumption.repository";

const idSchema = z.object({ businessIdeaId: z.string().uuid() });

export const runValidationPipeline = createServerFn({ method: "POST" })
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ValidationPlanService(db);
    return service.runPipeline(data.businessIdeaId);
  });

export const getValidationPlan = createServerFn({ method: "GET" })
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ValidationPlanService(db);
    return service.getPlan(data.businessIdeaId);
  });

export const approveValidationPlan = createServerFn({ method: "POST" })
  .validator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ValidationPlanService(db);
    const result = await service.approvePlan(data.businessIdeaId);
    await logAudit(db, {
      userId: user.id,
      action: AUDIT_ACTIONS.PLAN_APPROVED,
      entityType: "business_idea",
      entityId: data.businessIdeaId,
    });
    return result;
  });

// -- Hypothesis edits ----------------------------------------------------

const updateHypothesisSchema = z.object({
  hypothesisId: z.string().uuid(),
  statement: z.string().min(10).max(500).optional(),
  importance: ImportanceSchema.optional(),
  validationCriteria: z.string().min(10).max(500).optional(),
  threshold: z.string().max(200).nullable().optional(),
  thresholdType: ThresholdTypeSchema.nullable().optional(),
});

export const updateHypothesis = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateHypothesisSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const repo = new HypothesisRepository(db);
    const { hypothesisId, ...fields } = data;
    return repo.updateEditableFields(hypothesisId, fields);
  });

export const deleteHypothesis = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ hypothesisId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const repo = new HypothesisRepository(db);
    await repo.delete(data.hypothesisId);
    return { deleted: true };
  });

// -- Evidence requirement edits -------------------------------------------

const updateRequirementSchema = z.object({
  requirementId: z.string().uuid(),
  description: z.string().min(10).max(500).optional(),
  importance: ImportanceSchema.optional(),
  minimumEvidenceLevel: MinimumEvidenceLevelSchema.optional(),
});

export const updateEvidenceRequirement = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateRequirementSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const repo = new EvidenceRepository(db);
    const { requirementId, ...fields } = data;
    return repo.updateRequirementFields(requirementId, fields);
  });

export const deleteEvidenceRequirement = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ requirementId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const repo = new EvidenceRepository(db);
    await repo.deleteRequirement(data.requirementId);
    return { deleted: true };
  });

// -- Assumption edits ------------------------------------------------------

export const removeAssumption = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ assumptionId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const repo = new AssumptionRepository(db);
    await repo.remove(data.assumptionId);
    return { removed: true };
  });
