// =====================================================================
// ReportService (Phase 7, Steps 3, 4, 6, 14).
//
// Assembles a real, fully data-driven ReportSnapshot from the existing
// Phase 1-6 tables — no static/demo values, no invented scores. Score
// history is read directly from confidence_scores/opportunity_scores,
// which are insert-only (one new row per recalculation, never
// updated) since Phase 1/5 — so historical snapshots already exist in
// the database with zero additional storage; this service only reads
// and shapes them.
//
// Sharing: createShareLink/disableShareLink go through the normal
// RLS-respecting client (owner-only, like every other mutation).
// getSharedReport is the one deliberate, narrow service-role bypass in
// this file — a public visitor has no auth.uid() for RLS to match, so
// the share token itself (not a session) is the authorization
// mechanism, and only business ideas with share_enabled = true are
// ever returned.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { ReportSnapshot, ScoreHistoryPoint, UUID } from "@/lib/types/domain";
import { BusinessIdeaRepository } from "@/backend/repositories/business-idea.repository";
import { AssumptionRepository } from "@/backend/repositories/assumption.repository";
import { HypothesisRepository } from "@/backend/repositories/hypothesis.repository";
import { EvidenceRepository } from "@/backend/repositories/evidence.repository";
import { ConflictGapRepository } from "@/backend/repositories/conflict-gap.repository";
import { ScoringRepository } from "@/backend/repositories/scoring.repository";
import { ValidationRepository } from "@/backend/repositories/validation.repository";
import { ScoringService } from "@/backend/services/scoring.service";
import { ResearchRepository } from "@/backend/repositories/research.repository";
import { deriveProjectStatus } from "@/backend/services/project-status";
import { getSupabaseServiceClient } from "@/backend/db/client";

export class ReportService {
  private readonly businessIdeas: BusinessIdeaRepository;
  private readonly assumptions: AssumptionRepository;
  private readonly hypotheses: HypothesisRepository;
  private readonly evidence: EvidenceRepository;
  private readonly conflictsGaps: ConflictGapRepository;
  private readonly scoringRepo: ScoringRepository;
  private readonly validation: ValidationRepository;
  private readonly research: ResearchRepository;
  private readonly scoring: ScoringService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.businessIdeas = new BusinessIdeaRepository(db);
    this.assumptions = new AssumptionRepository(db);
    this.hypotheses = new HypothesisRepository(db);
    this.evidence = new EvidenceRepository(db);
    this.conflictsGaps = new ConflictGapRepository(db);
    this.scoringRepo = new ScoringRepository(db);
    this.validation = new ValidationRepository(db);
    this.research = new ResearchRepository(db);
    this.scoring = new ScoringService(db);
  }

  async buildReport(businessIdeaId: UUID): Promise<ReportSnapshot> {
    const businessIdea = await this.businessIdeas.getById(businessIdeaId);
    if (!businessIdea) throw new Error(`Business idea ${businessIdeaId} not found.`);

    const [assumptionsList, hypothesesList] = await Promise.all([
      this.assumptions.listByBusinessIdea(businessIdeaId),
      this.hypotheses.listByBusinessIdea(businessIdeaId),
    ]);
    const hypothesisIds = hypothesesList.map((h) => h.id);

    const [
      evidenceByHypothesis,
      requirementsByHypothesis,
      confidenceScores,
      conflicts,
      gaps,
      opportunityScore,
      decision,
    ] = await Promise.all([
      this.evidence.listByHypotheses(hypothesisIds),
      this.evidence.listRequirementsByHypotheses(hypothesisIds),
      this.scoringRepo.listLatestConfidenceScores(hypothesisIds),
      this.conflictsGaps.listConflictsByHypotheses(hypothesisIds),
      this.conflictsGaps.listGapsByHypotheses(hypothesisIds),
      this.scoringRepo.getLatestOpportunityScore(businessIdeaId),
      this.validation.getLatestDecision(businessIdeaId),
    ]);

    const coverageByHypothesis: Record<
      UUID,
      Awaited<ReturnType<typeof this.evidence.getCoverage>>
    > = {};
    for (const id of hypothesisIds) {
      coverageByHypothesis[id] = await this.evidence.getCoverage(id);
    }

    const [projectConfidence, criticalUncertainties, validationActions, scoreHistory] =
      await Promise.all([
        this.scoring.computeProjectConfidenceSummary(businessIdeaId),
        this.scoring.getCriticalUncertainties(businessIdeaId),
        this.validation.listByBusinessIdea(businessIdeaId),
        this.getScoreHistory(businessIdeaId, hypothesisIds),
      ]);

    const allEvidence = Object.values(evidenceByHypothesis).flat();
    const derivedStatus = deriveProjectStatus({
      businessIdea,
      hypothesisCount: hypothesesList.length,
      hasConfidenceScores: confidenceScores.length > 0,
      evidence: allEvidence,
      decision,
    });

    let researchRunsCount = 0;
    let researchSourcesCount = 0;
    for (const hypothesisId of hypothesisIds) {
      const runs = await this.research.listRunsByHypothesis(hypothesisId);
      researchRunsCount += runs.length;
      const tasks = await this.research.listTasksByHypothesis(hypothesisId);
      const sources = await this.research.listSourcesByTasks(tasks.map((t) => t.id));
      researchSourcesCount += sources.length;
    }

    return {
      businessIdea,
      assumptions: assumptionsList,
      hypotheses: hypothesesList,
      evidenceByHypothesis,
      evidenceRequirementsByHypothesis: requirementsByHypothesis,
      coverageByHypothesis,
      conflicts,
      gaps,
      confidenceScores,
      opportunityScore,
      projectConfidence,
      criticalUncertainties,
      validationActions,
      scoreHistory,
      researchRunsCount,
      researchSourcesCount,
      decision,
      derivedStatus,
      isDemo: false,
    };
  }

  /**
   * Reads the actual history of confidence_scores/opportunity_scores
   * rows over time — both tables are insert-only (a fresh row per
   * recalculation, never updated in place), so this reflects genuine
   * historical snapshots, never fabricated intermediate points.
   */
  async getScoreHistory(businessIdeaId: UUID, hypothesisIds: UUID[]): Promise<ScoreHistoryPoint[]> {
    if (hypothesisIds.length === 0) return [];

    const [{ data: confidenceRows, error: confErr }, { data: opportunityRows, error: oppErr }] =
      await Promise.all([
        this.db
          .from("confidence_scores")
          .select("hypothesis_id, final_confidence, evidence_coverage_pct, calculated_at")
          .in("hypothesis_id", hypothesisIds)
          .order("calculated_at", { ascending: true }),
        this.db
          .from("opportunity_scores")
          .select("overall_score, calculated_at")
          .eq("business_idea_id", businessIdeaId)
          .order("calculated_at", { ascending: true }),
      ]);
    if (confErr) throw confErr;
    if (oppErr) throw oppErr;

    // Bucket confidence rows by their calculation timestamp (rounded to
    // the minute) to approximate "one recalculation pass," then compute
    // a simple average confidence/coverage across hypotheses scored in
    // that pass — a straightforward, explainable approximation of
    // project-level history, not a claim of perfectly reconstructing
    // the importance-weighted formula at each historical instant.
    const buckets = new Map<string, { confidence: number[]; coverage: number[] }>();
    for (const row of confidenceRows ?? []) {
      const key = row.calculated_at.slice(0, 16); // minute precision
      const bucket = buckets.get(key) ?? { confidence: [], coverage: [] };
      bucket.confidence.push(Number(row.final_confidence));
      bucket.coverage.push(Number(row.evidence_coverage_pct));
      buckets.set(key, bucket);
    }

    const opportunityByMinute = new Map<string, number>();
    for (const row of opportunityRows ?? []) {
      opportunityByMinute.set(row.calculated_at.slice(0, 16), Number(row.overall_score));
    }

    const points: ScoreHistoryPoint[] = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([minute, bucket]) => ({
        calculatedAt: minute,
        overallConfidence: average(bucket.confidence),
        evidenceCoveragePct: average(bucket.coverage),
        opportunityScore: opportunityByMinute.get(minute) ?? null,
      }));

    return points;
  }

  async createShareLink(businessIdeaId: UUID) {
    return this.businessIdeas.createShareLink(businessIdeaId);
  }

  async disableShareLink(businessIdeaId: UUID) {
    return this.businessIdeas.disableShareLink(businessIdeaId);
  }

  /**
   * Public, unauthenticated access path. Deliberately uses the
   * service-role client (bypassing RLS) because there is no
   * authenticated session to check ownership against — the random,
   * unguessable share token IS the authorization. Only returns data
   * for business ideas with share_enabled = true, and reuses
   * buildReport()'s normal assembly so a shared report shows exactly
   * the same real, data-driven numbers the owner sees.
   */
  static async getSharedReport(token: string): Promise<ReportSnapshot | null> {
    const serviceClient = getSupabaseServiceClient();
    const businessIdeaRepo = new BusinessIdeaRepository(serviceClient);
    const businessIdea = await businessIdeaRepo.getByShareToken(token);
    if (!businessIdea) return null;

    const service = new ReportService(serviceClient);
    return service.buildReport(businessIdea.id);
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}
