import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  Decision,
  UserDecision,
  UUID,
  ValidationAction,
  ValidationPriority,
  ValidationResult,
} from "@/lib/types/domain";
import type { ValidationActionCandidateSchema } from "@/lib/types/schemas";
import type { z } from "zod";

type ActionRow = Database["public"]["Tables"]["validation_actions"]["Row"];
type ResultRow = Database["public"]["Tables"]["validation_results"]["Row"];
type DecisionRow = Database["public"]["Tables"]["user_decisions"]["Row"];

type ValidationActionCandidate = z.infer<typeof ValidationActionCandidateSchema> & {
  expectedInformationValue: number;
  priorityRank: number;
  priority: ValidationPriority;
  targetGapId?: UUID | null;
  estimatedCost?: string | null;
  estimatedTime?: string | null;
};

function actionToDomain(row: ActionRow): ValidationAction {
  return {
    id: row.id,
    businessIdeaId: row.business_idea_id,
    hypothesisId: row.hypothesis_id,
    targetGapId: row.target_gap_id,
    actionTitle: row.action_title,
    actionDescription: row.action_description,
    method: row.method,
    businessImpactScore: Number(row.business_impact_score),
    evidenceUncertaintyScore: Number(row.evidence_uncertainty_score),
    evidenceGapScore: Number(row.evidence_gap_score),
    validationCostScore: Number(row.validation_cost_score),
    expectedInformationValue: Number(row.expected_information_value),
    priorityRank: row.priority_rank,
    priority: row.priority,
    estimatedCost: row.estimated_cost,
    estimatedTime: row.estimated_time,
    reasoning: row.reasoning,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resultToDomain(row: ResultRow): ValidationResult {
  return {
    id: row.id,
    validationActionId: row.validation_action_id,
    outcomeSummary: row.outcome_summary,
    newEvidenceIds: row.new_evidence_ids,
    affectedHypothesisIds: row.affected_hypothesis_ids,
    recordedAt: row.recorded_at,
  };
}

function decisionToDomain(row: DecisionRow): UserDecision {
  return {
    id: row.id,
    businessIdeaId: row.business_idea_id,
    userId: row.user_id,
    decision: row.decision,
    decisionBasis: row.decision_basis,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class ValidationRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async createActions(candidates: ValidationActionCandidate[]): Promise<ValidationAction[]> {
    if (candidates.length === 0) return [];
    const rows = candidates.map((c) => ({
      business_idea_id: c.businessIdeaId,
      hypothesis_id: c.hypothesisId ?? null,
      target_gap_id: c.targetGapId ?? null,
      action_title: c.actionTitle,
      action_description: c.actionDescription,
      method: c.method,
      business_impact_score: c.businessImpactScore,
      evidence_uncertainty_score: c.evidenceUncertaintyScore,
      evidence_gap_score: c.evidenceGapScore,
      validation_cost_score: c.validationCostScore,
      expected_information_value: c.expectedInformationValue,
      priority_rank: c.priorityRank,
      priority: c.priority,
      estimated_cost: c.estimatedCost ?? null,
      estimated_time: c.estimatedTime ?? null,
      reasoning: c.reasoning,
      status: "recommended" as const,
    }));
    const { data, error } = await this.db.from("validation_actions").insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(actionToDomain);
  }

  async listByBusinessIdea(businessIdeaId: UUID): Promise<ValidationAction[]> {
    const { data, error } = await this.db
      .from("validation_actions")
      .select()
      .eq("business_idea_id", businessIdeaId)
      .order("priority_rank", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(actionToDomain);
  }

  /** Clears not-yet-acted-on recommendations before regenerating a fresh ranked set — accepted/completed/dismissed actions are preserved as history. */
  async deleteRecommendedByBusinessIdea(businessIdeaId: UUID): Promise<void> {
    const { error } = await this.db
      .from("validation_actions")
      .delete()
      .eq("business_idea_id", businessIdeaId)
      .eq("status", "recommended");
    if (error) throw error;
  }

  async updateStatus(id: UUID, status: ValidationAction["status"]): Promise<ValidationAction> {
    const { data, error } = await this.db
      .from("validation_actions")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return actionToDomain(data);
  }

  async getById(id: UUID): Promise<ValidationAction | null> {
    const { data, error } = await this.db
      .from("validation_actions")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? actionToDomain(data) : null;
  }

  async recordResult(
    validationActionId: UUID,
    outcomeSummary: string,
    newEvidenceIds: UUID[],
    affectedHypothesisIds: UUID[],
  ): Promise<ValidationResult> {
    const { data, error } = await this.db
      .from("validation_results")
      .insert({
        validation_action_id: validationActionId,
        outcome_summary: outcomeSummary,
        new_evidence_ids: newEvidenceIds,
        affected_hypothesis_ids: affectedHypothesisIds,
      })
      .select()
      .single();
    if (error) throw error;

    await this.db
      .from("validation_actions")
      .update({ status: "completed" })
      .eq("id", validationActionId);

    return resultToDomain(data);
  }

  async recordDecision(
    businessIdeaId: UUID,
    userId: UUID,
    decision: Decision,
    notes?: string,
    decisionBasis?: string,
  ): Promise<UserDecision> {
    const { data, error } = await this.db
      .from("user_decisions")
      .insert({
        business_idea_id: businessIdeaId,
        user_id: userId,
        decision,
        notes: notes ?? null,
        decision_basis: decisionBasis ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return decisionToDomain(data);
  }

  async getLatestDecision(businessIdeaId: UUID): Promise<UserDecision | null> {
    const { data, error } = await this.db
      .from("user_decisions")
      .select()
      .eq("business_idea_id", businessIdeaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? decisionToDomain(data) : null;
  }
}
