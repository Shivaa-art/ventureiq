// =====================================================================
// Dashboard data (Phase 7, Step 1).
//
// Assembles real per-user project metrics from the actual database —
// no hardcoded/demo values. Each project card is built from its
// business idea's latest confidence/opportunity scores (if any exist
// yet) and derived status.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { DerivedProjectStatus, UUID } from "@/lib/types/domain";
import { ProjectRepository } from "@/backend/repositories/project.repository";
import { BusinessIdeaRepository } from "@/backend/repositories/business-idea.repository";
import { HypothesisRepository } from "@/backend/repositories/hypothesis.repository";
import { EvidenceRepository } from "@/backend/repositories/evidence.repository";
import { ScoringRepository } from "@/backend/repositories/scoring.repository";
import { ValidationRepository } from "@/backend/repositories/validation.repository";
import { deriveProjectStatus } from "@/backend/services/project-status";

export interface DashboardProjectCard {
  projectId: UUID;
  businessIdeaId: UUID;
  name: string;
  industry: string | null;
  createdAt: string;
  updatedAt: string;
  status: DerivedProjectStatus;
  opportunityScore: number | null;
  overallConfidence: number | null;
  evidenceCoveragePct: number | null;
}

export interface DashboardData {
  totalProjects: number;
  activeProjects: number;
  completedAnalyses: number;
  averageOpportunityScore: number | null;
  averageConfidence: number | null;
  recentProjects: DashboardProjectCard[];
}

export class DashboardService {
  private readonly projects: ProjectRepository;
  private readonly businessIdeas: BusinessIdeaRepository;
  private readonly hypotheses: HypothesisRepository;
  private readonly evidence: EvidenceRepository;
  private readonly scoringRepo: ScoringRepository;
  private readonly validation: ValidationRepository;

  constructor(db: SupabaseClient<Database>) {
    this.projects = new ProjectRepository(db);
    this.businessIdeas = new BusinessIdeaRepository(db);
    this.hypotheses = new HypothesisRepository(db);
    this.evidence = new EvidenceRepository(db);
    this.scoringRepo = new ScoringRepository(db);
    this.validation = new ValidationRepository(db);
  }

  async getDashboardData(userId: UUID): Promise<DashboardData> {
    const projectList = await this.projects.listByUser(userId);

    const cards: DashboardProjectCard[] = [];
    for (const project of projectList) {
      const businessIdea = await this.businessIdeas.getByProjectId(project.id);
      if (!businessIdea) continue;

      const hypothesesList = await this.hypotheses.listByBusinessIdea(businessIdea.id);
      const hypothesisIds = hypothesesList.map((h) => h.id);

      const [confidenceScores, opportunityScore, decision, evidenceByHypothesis] =
        await Promise.all([
          this.scoringRepo.listLatestConfidenceScores(hypothesisIds),
          this.scoringRepo.getLatestOpportunityScore(businessIdea.id),
          this.validation.getLatestDecision(businessIdea.id),
          this.evidence.listByHypotheses(hypothesisIds),
        ]);

      const allEvidence = Object.values(evidenceByHypothesis).flat();
      const status = deriveProjectStatus({
        businessIdea,
        hypothesisCount: hypothesesList.length,
        hasConfidenceScores: confidenceScores.length > 0,
        evidence: allEvidence,
        decision,
      });

      let coveragePct: number | null = null;
      if (hypothesisIds.length > 0) {
        let sum = 0;
        for (const id of hypothesisIds) {
          sum += (await this.evidence.getCoverage(id)).coveragePct;
        }
        coveragePct = Math.round((sum / hypothesisIds.length) * 100) / 100;
      }

      cards.push({
        projectId: project.id,
        businessIdeaId: businessIdea.id,
        name: project.name,
        industry: businessIdea.structured?.industry ?? businessIdea.raw.industry ?? null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        status,
        opportunityScore: opportunityScore ? opportunityScore.overallScore : null,
        overallConfidence:
          confidenceScores.length > 0
            ? average(confidenceScores.map((c) => c.finalConfidence))
            : null,
        evidenceCoveragePct: coveragePct,
      });
    }

    cards.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const withOpportunity = cards.filter((c) => c.opportunityScore != null);
    const withConfidence = cards.filter((c) => c.overallConfidence != null);
    const activeStatuses: DerivedProjectStatus[] = [
      "validation_plan",
      "researching",
      "review",
      "ready_for_decision",
    ];

    return {
      totalProjects: cards.length,
      activeProjects: cards.filter((c) => activeStatuses.includes(c.status)).length,
      completedAnalyses: cards.filter((c) => c.status === "completed").length,
      averageOpportunityScore: withOpportunity.length
        ? average(withOpportunity.map((c) => c.opportunityScore as number))
        : null,
      averageConfidence: withConfidence.length
        ? average(withConfidence.map((c) => c.overallConfidence as number))
        : null,
      recentProjects: cards.slice(0, 10),
    };
  }
}

function average(values: number[]): number {
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}
