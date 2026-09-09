import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  BusinessIdea,
  PipelineStageStatus,
  PlanStatus,
  RawBusinessIdeaInput,
  StructuredBusinessIdea,
  StructuringStatus,
  UUID,
} from "@/lib/types/domain";

type Row = Database["public"]["Tables"]["business_ideas"]["Row"];

function toDomain(row: Row): BusinessIdea {
  const raw: RawBusinessIdeaInput = {
    businessName: row.raw_business_name,
    description: row.raw_description,
    industry: row.raw_industry ?? undefined,
    country: row.raw_country ?? undefined,
    state: row.raw_state ?? undefined,
    city: row.raw_city ?? undefined,
    targetCustomer: row.raw_target_customer ?? undefined,
    problem: row.raw_problem ?? undefined,
    solution: row.raw_solution ?? undefined,
    businessModel: row.raw_business_model ?? undefined,
    expectedPricing: row.raw_expected_pricing ?? undefined,
    estimatedInvestment: row.raw_estimated_investment ?? undefined,
    revenueModel: row.raw_revenue_model ?? undefined,
  };

  return {
    id: row.id,
    projectId: row.project_id,
    raw,
    structured: (row.structured as StructuredBusinessIdea | null) ?? null,
    structuringStatus: row.structuring_status,
    structuringModel: row.structuring_model,
    structuringError: row.structuring_error,
    assumptionsStatus: row.assumptions_status,
    assumptionsError: row.assumptions_error,
    hypothesesStatus: row.hypotheses_status,
    hypothesesError: row.hypotheses_error,
    evidenceRequirementsStatus: row.evidence_requirements_status,
    evidenceRequirementsError: row.evidence_requirements_error,
    planStatus: row.plan_status,
    planApprovedAt: row.plan_approved_at,
    shareToken: row.share_token,
    shareEnabled: row.share_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BusinessIdeaRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async create(projectId: UUID, raw: RawBusinessIdeaInput): Promise<BusinessIdea> {
    const { data, error } = await this.db
      .from("business_ideas")
      .insert({
        project_id: projectId,
        raw_business_name: raw.businessName,
        raw_description: raw.description,
        raw_industry: raw.industry ?? null,
        raw_country: raw.country ?? null,
        raw_state: raw.state ?? null,
        raw_city: raw.city ?? null,
        raw_target_customer: raw.targetCustomer ?? null,
        raw_problem: raw.problem ?? null,
        raw_solution: raw.solution ?? null,
        raw_business_model: raw.businessModel ?? null,
        raw_expected_pricing: raw.expectedPricing ?? null,
        raw_estimated_investment: raw.estimatedInvestment ?? null,
        raw_revenue_model: raw.revenueModel ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }

  async getById(id: UUID): Promise<BusinessIdea | null> {
    const { data, error } = await this.db
      .from("business_ideas")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async getByProjectId(projectId: UUID): Promise<BusinessIdea | null> {
    const { data, error } = await this.db
      .from("business_ideas")
      .select()
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async setStructuringStatus(
    id: UUID,
    status: StructuringStatus,
    error_?: string | null,
  ): Promise<void> {
    const { error } = await this.db
      .from("business_ideas")
      .update({ structuring_status: status, structuring_error: error_ ?? null })
      .eq("id", id);
    if (error) throw error;
  }

  async saveStructured(
    id: UUID,
    structured: StructuredBusinessIdea,
    model: string,
  ): Promise<BusinessIdea> {
    const { data, error } = await this.db
      .from("business_ideas")
      .update({
        structured: structured as unknown as Record<string, unknown>,
        structuring_status: "completed",
        structuring_model: model,
        structuring_error: null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }

  async setAssumptionsStatus(
    id: UUID,
    status: PipelineStageStatus,
    error_?: string | null,
  ): Promise<void> {
    const { error } = await this.db
      .from("business_ideas")
      .update({ assumptions_status: status, assumptions_error: error_ ?? null })
      .eq("id", id);
    if (error) throw error;
  }

  async setHypothesesStatus(
    id: UUID,
    status: PipelineStageStatus,
    error_?: string | null,
  ): Promise<void> {
    const { error } = await this.db
      .from("business_ideas")
      .update({ hypotheses_status: status, hypotheses_error: error_ ?? null })
      .eq("id", id);
    if (error) throw error;
  }

  async setEvidenceRequirementsStatus(
    id: UUID,
    status: PipelineStageStatus,
    error_?: string | null,
  ): Promise<void> {
    const { error } = await this.db
      .from("business_ideas")
      .update({ evidence_requirements_status: status, evidence_requirements_error: error_ ?? null })
      .eq("id", id);
    if (error) throw error;
  }

  async setPlanStatus(id: UUID, status: PlanStatus): Promise<BusinessIdea> {
    const { data, error } = await this.db
      .from("business_ideas")
      .update({
        plan_status: status,
        plan_approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }

  /**
   * Generates and persists a new share token, enabling public read-only
   * access to this business idea's report. A fresh random token is
   * always generated (never reused), so a previously-shared, then-
   * disabled link cannot be silently reactivated by guessing the old
   * token — see disableShareLink.
   */
  async createShareLink(id: UUID): Promise<BusinessIdea> {
    const token = generateShareToken();
    const { data, error } = await this.db
      .from("business_ideas")
      .update({ share_token: token, share_enabled: true })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }

  async disableShareLink(id: UUID): Promise<BusinessIdea> {
    const { data, error } = await this.db
      .from("business_ideas")
      .update({ share_enabled: false })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toDomain(data);
  }

  /**
   * Public share lookup — callers MUST use the service-role client for
   * this (see report.service.ts::getSharedReport), since an anonymous
   * visitor has no auth.uid() for RLS to match against. The token
   * itself, not a session, is the authorization here — only rows with
   * share_enabled = true are returned.
   */
  async getByShareToken(token: string): Promise<BusinessIdea | null> {
    const { data, error } = await this.db
      .from("business_ideas")
      .select()
      .eq("share_token", token)
      .eq("share_enabled", true)
      .maybeSingle();
    if (error) throw error;
    return data ? toDomain(data) : null;
  }
}

function generateShareToken(): string {
  // 32 hex chars (128 bits) — cryptographically random, unguessable.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
