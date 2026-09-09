// =====================================================================
// Audit trail (Phase 7, Step 13).
//
// Thin wrapper around ActivityLogRepository with the Phase 7 field
// shape (action, entity_type, entity_id) — called from the API layer
// (the natural user-facing action boundary) right after the
// underlying operation succeeds, rather than deep inside business
// logic, so adding audit coverage never required touching already-
// approved service internals from earlier phases.
//
// Never pass secrets (API keys, tokens, credentials) in metadata —
// this is app-level convention, not a technical filter, so callers
// must be deliberate about what they pass.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { UUID } from "@/lib/types/domain";

export const AUDIT_ACTIONS = {
  PROJECT_CREATED: "project.created",
  PLAN_APPROVED: "plan.approved",
  EVIDENCE_ADDED: "evidence.added",
  EVIDENCE_ACCEPTED: "evidence.accepted",
  EVIDENCE_REJECTED: "evidence.rejected",
  EVIDENCE_FLAGGED: "evidence.flagged",
  RESEARCH_STARTED: "research.started",
  RESEARCH_COMPLETED: "research.completed",
  VALIDATION_RESULT_RECORDED: "validation_result.recorded",
  DECISION_RECORDED: "decision.recorded",
  SHARE_LINK_CREATED: "share_link.created",
  SHARE_LINK_DISABLED: "share_link.disabled",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export async function logAudit(
  db: SupabaseClient<Database>,
  params: {
    userId: UUID;
    projectId?: UUID | null;
    action: AuditAction;
    entityType: string;
    entityId: UUID;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  // Reuses the existing event_type/payload columns for backward
  // compatibility with Phase 1's ActivityLogRepository.log() signature,
  // while also writing the new structured entity_type/entity_id
  // columns directly.
  const { error } = await db.from("activity_logs").insert({
    event_type: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    payload: params.metadata ?? {},
    user_id: params.userId,
    project_id: params.projectId ?? null,
  });
  if (error) throw error;
}
