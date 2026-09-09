// =====================================================================
// Scoring & Adaptive Validation API (Phase 5, Steps 15-16).
//
// Every handler uses the request-scoped, RLS-respecting Supabase
// client — a founder can only ever trigger recalculation, record a
// validation result, or record a decision for their own business
// ideas, enforced by Postgres RLS.
// =====================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient } from "@/backend/auth/supabase-server-client";
import { requireServerUser } from "@/backend/auth/session";
import { ScoringService } from "@/backend/services/scoring.service";
import { logAudit, AUDIT_ACTIONS } from "@/backend/services/audit.service";
import { ScoringRepository } from "@/backend/repositories/scoring.repository";
import { ValidationRepository } from "@/backend/repositories/validation.repository";
import { DecisionSchema, SupportDirectionSchema } from "@/lib/types/schemas";

const businessIdeaIdSchema = z.object({ businessIdeaId: z.string().uuid() });

export const getProjectOverview = createServerFn({ method: "GET" })
  .validator((data: unknown) => businessIdeaIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ScoringService(db);

    const [projectConfidence, criticalUncertainties] = await Promise.all([
      service.computeProjectConfidenceSummary(data.businessIdeaId),
      service.getCriticalUncertainties(data.businessIdeaId),
    ]);

    const scoringRepo = new ScoringRepository(db);
    const validationRepo = new ValidationRepository(db);

    const [opportunityScore, decision, validationActions] = await Promise.all([
      scoringRepo.getLatestOpportunityScore(data.businessIdeaId),
      validationRepo.getLatestDecision(data.businessIdeaId),
      validationRepo.listByBusinessIdea(data.businessIdeaId),
    ]);

    return {
      projectConfidence,
      criticalUncertainties,
      opportunityScore,
      decision,
      validationActions,
    };
  });

export const recalculateProject = createServerFn({ method: "POST" })
  .validator((data: unknown) => businessIdeaIdSchema.parse(data))
  .handler(async ({ data }) => {
    await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ScoringService(db);
    return service.recalculateAll(data.businessIdeaId);
  });

const recordValidationResultSchema = z.object({
  validationActionId: z.string().uuid(),
  hypothesisId: z.string().uuid(),
  outcome: SupportDirectionSchema,
  result: z.string().min(5).max(1000),
  notes: z.string().max(2000).nullable().optional(),
  supportingData: z.string().max(500).nullable().optional(),
  date: z.string().nullable().optional(),
});

export const recordValidationResult = createServerFn({ method: "POST" })
  .validator((data: unknown) => recordValidationResultSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ScoringService(db);
    const result = await service.recordValidationResult(data);
    await logAudit(db, {
      userId: user.id,
      action: AUDIT_ACTIONS.VALIDATION_RESULT_RECORDED,
      entityType: "validation_action",
      entityId: data.validationActionId,
      metadata: { outcome: data.outcome },
    });
    return result;
  });

const recordDecisionSchema = z.object({
  businessIdeaId: z.string().uuid(),
  decision: DecisionSchema,
  decisionBasis: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

export const recordDecision = createServerFn({ method: "POST" })
  .validator((data: unknown) => recordDecisionSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await requireServerUser();
    const db = getSupabaseServerClient();
    const service = new ScoringService(db);
    const result = await service.recordDecision(
      data.businessIdeaId,
      user.id,
      data.decision,
      data.notes,
      data.decisionBasis,
    );
    await logAudit(db, {
      userId: user.id,
      action: AUDIT_ACTIONS.DECISION_RECORDED,
      entityType: "business_idea",
      entityId: data.businessIdeaId,
      metadata: { decision: data.decision },
    });
    return result;
  });
