import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  ConfidenceScore,
  ConfidenceWeights,
  OpportunityDimensionKey,
  OpportunityDimensions,
  OpportunityScore,
  UUID,
} from "@/lib/types/domain";

type ConfidenceRow = Database["public"]["Tables"]["confidence_scores"]["Row"];
type OpportunityRow = Database["public"]["Tables"]["opportunity_scores"]["Row"];

function confidenceToDomain(row: ConfidenceRow): ConfidenceScore {
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    finalConfidence: Number(row.final_confidence),
    confidenceLevel: row.confidence_level,
    evidenceQualityComponent: Number(row.evidence_quality_component),
    sourceReliabilityComponent: Number(row.source_reliability_component),
    relevanceComponent: Number(row.relevance_component),
    recencyComponent: Number(row.recency_component),
    independenceComponent: Number(row.independence_component),
    supportingEvidenceCount: row.supporting_evidence_count,
    contradictingEvidenceCount: row.contradicting_evidence_count,
    independentEvidenceCount: row.independent_evidence_count,
    evidenceCoveragePct: Number(row.evidence_coverage_pct),
    gapPenaltyComponent: Number(row.gap_penalty_component),
    conflictPenaltyComponent: Number(row.conflict_penalty_component),
    formulaVersion: row.formula_version,
    weights: row.weights as unknown as ConfidenceWeights,
    explanation: row.explanation,
    supportingFactorSummary: row.supporting_factor_summary,
    contradictingFactorSummary: row.contradicting_factor_summary,
    calculatedAt: row.calculated_at,
  };
}

function opportunityToDomain(row: OpportunityRow): OpportunityScore {
  return {
    id: row.id,
    businessIdeaId: row.business_idea_id,
    rawScore: Number(row.raw_score),
    overallScore: Number(row.overall_score),
    overallConfidence: Number(row.overall_confidence),
    dimensions: row.dimensions as OpportunityDimensions,
    formulaVersion: row.formula_version,
    weights: row.weights as Record<OpportunityDimensionKey, number>,
    calculatedAt: row.calculated_at,
  };
}

export class ScoringRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async saveConfidenceScore(
    score: Omit<ConfidenceScore, "id" | "calculatedAt">,
  ): Promise<ConfidenceScore> {
    const { data, error } = await this.db
      .from("confidence_scores")
      .insert({
        hypothesis_id: score.hypothesisId,
        final_confidence: score.finalConfidence,
        confidence_level: score.confidenceLevel,
        evidence_quality_component: score.evidenceQualityComponent,
        source_reliability_component: score.sourceReliabilityComponent,
        relevance_component: score.relevanceComponent,
        recency_component: score.recencyComponent,
        independence_component: score.independenceComponent,
        supporting_evidence_count: score.supportingEvidenceCount,
        contradicting_evidence_count: score.contradictingEvidenceCount,
        independent_evidence_count: score.independentEvidenceCount,
        evidence_coverage_pct: score.evidenceCoveragePct,
        gap_penalty_component: score.gapPenaltyComponent,
        conflict_penalty_component: score.conflictPenaltyComponent,
        formula_version: score.formulaVersion,
        weights: score.weights as unknown as Record<string, number>,
        explanation: score.explanation,
        supporting_factor_summary: score.supportingFactorSummary,
        contradicting_factor_summary: score.contradictingFactorSummary,
      })
      .select()
      .single();
    if (error) throw error;
    return confidenceToDomain(data);
  }

  async getLatestConfidenceScore(hypothesisId: UUID): Promise<ConfidenceScore | null> {
    const { data, error } = await this.db
      .from("confidence_scores")
      .select()
      .eq("hypothesis_id", hypothesisId)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? confidenceToDomain(data) : null;
  }

  async listLatestConfidenceScores(hypothesisIds: UUID[]): Promise<ConfidenceScore[]> {
    if (hypothesisIds.length === 0) return [];
    const { data, error } = await this.db
      .from("confidence_scores")
      .select()
      .in("hypothesis_id", hypothesisIds)
      .order("calculated_at", { ascending: false });
    if (error) throw error;
    // keep only the newest row per hypothesis
    const seen = new Set<UUID>();
    const latest: ConfidenceScore[] = [];
    for (const row of data ?? []) {
      if (seen.has(row.hypothesis_id)) continue;
      seen.add(row.hypothesis_id);
      latest.push(confidenceToDomain(row));
    }
    return latest;
  }

  async saveOpportunityScore(
    score: Omit<OpportunityScore, "id" | "calculatedAt">,
  ): Promise<OpportunityScore> {
    const { data, error } = await this.db
      .from("opportunity_scores")
      .insert({
        business_idea_id: score.businessIdeaId,
        raw_score: score.rawScore,
        overall_score: score.overallScore,
        overall_confidence: score.overallConfidence,
        dimensions: score.dimensions,
        formula_version: score.formulaVersion,
        weights: score.weights,
      })
      .select()
      .single();
    if (error) throw error;
    return opportunityToDomain(data);
  }

  async getLatestOpportunityScore(businessIdeaId: UUID): Promise<OpportunityScore | null> {
    const { data, error } = await this.db
      .from("opportunity_scores")
      .select()
      .eq("business_idea_id", businessIdeaId)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? opportunityToDomain(data) : null;
  }
}
