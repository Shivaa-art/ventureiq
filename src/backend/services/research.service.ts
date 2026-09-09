// =====================================================================
// ResearchService — orchestrates Phase 6's external research pipeline:
//
//   Hypothesis + Evidence Requirements + Existing Evidence
//     -> research-planner.service.ts (research question + queries, LLM)
//     -> web-search-provider.ts (source retrieval + grounded extraction, LLM+tool)
//     -> source-quality.ts (deterministic categorization + scoring)
//     -> normalizeEvidence (Phase 4, unmodified) -> Evidence rows,
//        created with reviewStatus "pending_review"
//     -> human review (accept/reject) -> Phase 4/5 recalculation
//
// "Research this hypothesis" = startResearchRun(). "Refresh Research"
// = calling startResearchRun() again (a new, separate run — never
// overwrites or deletes a prior run's tasks/sources/evidence).
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { Evidence, EvidenceReviewStatus, Hypothesis, UUID } from "@/lib/types/domain";
import { HypothesisRepository } from "@/backend/repositories/hypothesis.repository";
import { EvidenceRepository } from "@/backend/repositories/evidence.repository";
import { ResearchRepository } from "@/backend/repositories/research.repository";
import { planResearch } from "@/backend/research/research-planner.service";
import {
  runWebSearchResearch,
  WEB_SEARCH_PROVIDER_ID,
  WEB_SEARCH_PROVIDER_VERSION,
} from "@/backend/research/web-search-provider";
import {
  categorizeSource,
  computeSourceQualityScore,
  independenceScoreForSource,
  reliabilityScoreForSource,
} from "@/backend/research/source-quality";
import {
  computeSourceFingerprint,
  recencyScore,
  relevanceScore,
} from "@/backend/evidence/evidence-quality";
import { normalizeEvidence } from "@/backend/services/evidence-normalization.service";
import { EvidenceCollectionService } from "@/backend/services/evidence-collection.service";
import { ScoringService } from "@/backend/services/scoring.service";
import { StructuredGenerationError, getAIProvider } from "@/backend/ai/client";

/** Hard cap on sources actually selected for extraction per query (Phase 6, Step 16). */
const MAX_SOURCES_PER_QUERY = 3;
/** Hard cap on total sources persisted per research run (Phase 6, Step 16). */
const MAX_SOURCES_PER_RUN = 20;

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export class ResearchService {
  private readonly hypotheses: HypothesisRepository;
  private readonly evidence: EvidenceRepository;
  private readonly research: ResearchRepository;
  private readonly evidenceCollection: EvidenceCollectionService;
  private readonly scoring: ScoringService;

  constructor(private readonly db: SupabaseClient<Database>) {
    this.hypotheses = new HypothesisRepository(db);
    this.evidence = new EvidenceRepository(db);
    this.research = new ResearchRepository(db);
    this.evidenceCollection = new EvidenceCollectionService(db);
    this.scoring = new ScoringService(db);
  }

  /**
   * "Research this hypothesis" (Phase 6, Step 13) / "Refresh Research"
   * (Step 14) — always starts a brand new, separately-tracked run.
   * Every failure mode (planning failure, search failure, extraction
   * failure) is caught per-task/per-source so one bad query doesn't
   * abort the whole run — the run's final status reflects how much of
   * it actually succeeded (completed / partial / failed), never faked.
   */
  async startResearchRun(hypothesisId: UUID): Promise<UUID> {
    const hypothesis = await this.hypotheses.getById(hypothesisId);
    if (!hypothesis) throw new Error(`Hypothesis ${hypothesisId} not found.`);

    const [requirements, existingEvidence] = await Promise.all([
      this.evidence.listRequirementsByHypothesis(hypothesisId),
      this.evidence.listByHypothesis(hypothesisId),
    ]);

    const run = await this.research.createRun(hypothesisId);

    // Capability gate (Gemini migration): planning (query generation)
    // works fine with any provider via generateStructured — only the
    // actual SOURCE RETRIEVAL step needs a provider with real web
    // search. Rather than fabricate sources when the configured
    // provider can't back them (Gemini free tier, in this
    // implementation), every task is still created for traceability —
    // the founder can see exactly what would have been searched — but
    // is marked failed with an honest, actionable reason instead of
    // silently producing nothing or, worse, inventing a result.
    const canSearch = getAIProvider().supportsWebSearch;

    let totalQueries = 0;
    let totalSources = 0;
    let anyTaskSucceeded = false;
    let anyTaskFailed = false;

    try {
      const plans = await planResearch(hypothesis, requirements, existingEvidence);

      if (plans.length === 0) {
        await this.research.updateRun(run.id, {
          status: "completed",
          completedAt: new Date().toISOString(),
          queryCount: 0,
          sourceCount: 0,
        });
        return run.id;
      }

      for (const plan of plans) {
        const task = await this.research.createTask({
          researchRunId: run.id,
          hypothesisId,
          evidenceRequirementId: plan.requirement.id,
          researchQuestion: plan.researchQuestion || plan.requirement.description,
          priority: plan.requirement.importance,
        });

        if (plan.error || plan.queries.length === 0) {
          await this.research.updateTaskStatus(
            task.id,
            "failed",
            plan.error ?? "No queries generated.",
          );
          anyTaskFailed = true;
          continue;
        }

        if (!canSearch) {
          await this.research.updateTaskStatus(
            task.id,
            "failed",
            `The configured AI provider ("${getAIProvider().id}") does not support real external web search in ` +
              `this implementation, so no sources were retrieved — nothing was fabricated to fill the gap. ` +
              `Set AI_PROVIDER=anthropic to enable real research, or use "Collect demo evidence" in the Evidence ` +
              `Workspace for illustrative, clearly-labeled demo evidence instead.`,
          );
          anyTaskFailed = true;
          continue;
        }

        await this.research.updateTaskStatus(task.id, "running");
        let taskHadFailure = false;

        for (const q of plan.queries) {
          if (totalSources >= MAX_SOURCES_PER_RUN) break;
          const queryRow = await this.research.createQuery(task.id, q.query, q.reason);
          totalQueries += 1;

          try {
            await this.runQueryAndPersistSources(
              hypothesis,
              task.id,
              queryRow.id,
              plan.researchQuestion,
              q.query,
            );
          } catch (err) {
            taskHadFailure = true;
            const message = err instanceof StructuredGenerationError ? err.message : String(err);
            await this.research.updateTaskStatus(task.id, "failed", message);
          }
        }

        // Recount sources actually persisted for this task (some queries may have partially succeeded).
        const taskSources = await this.research.listSourcesByTask(task.id);
        totalSources += taskSources.filter((s) => s.status === "retrieved").length;

        if (!taskHadFailure) {
          await this.research.updateTaskStatus(task.id, "completed");
          anyTaskSucceeded = true;
        } else {
          anyTaskFailed = true;
        }
      }

      const finalStatus =
        anyTaskSucceeded && anyTaskFailed ? "partial" : anyTaskSucceeded ? "completed" : "failed";
      await this.research.updateRun(run.id, {
        status: finalStatus,
        completedAt: new Date().toISOString(),
        queryCount: totalQueries,
        sourceCount: totalSources,
      });
    } catch (err) {
      await this.research.updateRun(run.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        queryCount: totalQueries,
        sourceCount: totalSources,
        error: err instanceof Error ? err.message : "Research run failed for an unknown reason.",
      });
    }

    return run.id;
  }

  private async runQueryAndPersistSources(
    hypothesis: Hypothesis,
    taskId: UUID,
    queryId: UUID,
    researchQuestion: string,
    query: string,
  ): Promise<void> {
    const result = await runWebSearchResearch(researchQuestion, hypothesis.statement, query);

    if (!result.searchWasInvoked || result.retrievedSources.length === 0) {
      // Legitimate "nothing found" — not fabricated, not an error.
      return;
    }

    // Cross-reference retrieved sources with grounded extractions; a
    // retrieved source with no matching extraction still gets recorded
    // (so the founder can see what was found even if nothing extractable
    // came of it), just without an evidence link.
    const extractionByUrl = new Map(result.extractions.map((e) => [e.sourceUrl, e]));
    const selected = result.retrievedSources.slice(0, MAX_SOURCES_PER_QUERY);

    for (const source of selected) {
      const domain = extractDomain(source.url);
      const category = domain ? categorizeSource(domain) : "unknown";
      const fingerprint = computeSourceFingerprint({
        sourceUrl: source.url,
        source: source.title ?? source.url,
      });

      // Cost control: reuse an already-retrieved source for this
      // hypothesis rather than re-persisting a duplicate.
      const existing = await this.research.findExistingSourceByFingerprint(
        hypothesis.id,
        fingerprint,
      );
      if (existing) continue;

      const extraction = extractionByUrl.get(source.url);
      const isoDate =
        source.pageAgeRaw && /^\d{4}-\d{2}-\d{2}/.test(source.pageAgeRaw)
          ? source.pageAgeRaw.slice(0, 10)
          : null;
      const rScore = recencyScore(isoDate);
      const qualityScore = computeSourceQualityScore({
        category,
        recencyScore: rScore,
        hasAccessibleContent: extraction != null,
      });

      const sourceRow = await this.research.createSource({
        researchTaskId: taskId,
        researchQueryId: queryId,
        sourceUrl: source.url,
        sourceTitle: source.title,
        domain,
        publicationDate: isoDate,
        snippet: extraction?.supportingText ?? null,
        sourceCategory: category,
        sourceFingerprint: fingerprint,
        qualityScore,
        status: extraction ? "retrieved" : "source_unavailable",
      });

      if (!extraction) continue;

      const draft = normalizeEvidence({
        content: {
          hypothesisId: hypothesis.id,
          evidenceRequirementId: null,
          source: source.title ?? domain ?? source.url,
          sourceType: "market_data",
          sourceUrl: source.url,
          sourceTitle: source.title,
          publicationDate: isoDate,
          summary: `${extraction.claim} — "${extraction.supportingText}"`,
          provenance: {
            providerId: WEB_SEARCH_PROVIDER_ID,
            providerVersion: WEB_SEARCH_PROVIDER_VERSION,
            query,
            collectedBy: "system",
          },
          dataStatus: "real",
        },
        supportDirection: extraction.supportDirection,
        classificationConfidence: extraction.relevance,
        classificationReason: extraction.reason,
      });

      // Override the deterministic reliability/independence with the
      // source-category-aware versions (Phase 6, Step 5) rather than
      // evidence-quality.ts's generic evidence.sourceType-based ones —
      // this evidence's authority comes from the PUBLISHER, which
      // source-quality.ts models specifically.
      draft.reliabilityScore = reliabilityScoreForSource(category, "real");
      draft.independenceScore = independenceScoreForSource(category, "real");
      draft.relevanceScore = relevanceScore({
        hasRequirementLink: false,
        evidenceTypeKeyword: null,
        summary: extraction.claim,
      });
      draft.sourceFingerprint = fingerprint;
      draft.reviewStatus = "pending_review"; // human review gate — never auto-trusted
      draft.researchSourceId = sourceRow.id;

      const [created] = await this.evidence.createEvidence([draft]);
      await this.evidence.createRelationships([
        {
          hypothesisId: hypothesis.id,
          evidenceId: created.id,
          relationshipType:
            extraction.supportDirection === "supports"
              ? "supports_hypothesis"
              : extraction.supportDirection === "contradicts"
                ? "contradicts_hypothesis"
                : "neutral_to_hypothesis",
          classificationConfidence: extraction.relevance,
          reason: extraction.reason,
        },
      ]);
      await this.research.linkSourceToEvidence(sourceRow.id, created.id);
    }
  }

  /**
   * Human review action (Phase 6, Step 11). Only on acceptance does
   * this trigger the existing Phase 4/5 recalculation chain — a
   * rejected or still-pending item never moves coverage, gaps,
   * conflicts, confidence, or opportunity score.
   */
  async reviewEvidence(evidenceId: UUID, decision: EvidenceReviewStatus) {
    const evidence = await this.evidence.getById(evidenceId);
    if (!evidence) throw new Error(`Evidence ${evidenceId} not found.`);

    await this.evidence.updateReviewStatus(evidenceId, decision);

    if (decision !== "accepted") {
      return { evidence: await this.evidence.getById(evidenceId) };
    }

    await this.evidenceCollection.reevaluate(evidence.hypothesisId);
    const hypothesis = await this.hypotheses.getById(evidence.hypothesisId);
    if (hypothesis) {
      await this.scoring.recalculateAll(hypothesis.businessIdeaId);
    }

    return { evidence: await this.evidence.getById(evidenceId) };
  }

  async getResearchWorkspace(hypothesisId: UUID) {
    const runs = await this.research.listRunsByHypothesis(hypothesisId);
    const tasks = await this.research.listTasksByHypothesis(hypothesisId);
    const taskIds = tasks.map((t) => t.id);
    const [queries, sources, evidenceItems] = await Promise.all([
      this.research.listQueriesByTasks(taskIds),
      this.research.listSourcesByTasks(taskIds),
      this.evidence.listByHypothesis(hypothesisId),
    ]);

    const externalEvidence = evidenceItems.filter((e: Evidence) => e.researchSourceId != null);

    return { runs, tasks, queries, sources, externalEvidence };
  }
}
