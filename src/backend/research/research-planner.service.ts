// =====================================================================
// research-planner.service.ts (Phase 6, Step 2 & 3).
//
// Input: a hypothesis, its evidence requirements, and its existing
// evidence. Output: one ResearchTask per requirement worth researching
// (skips requirements already well-covered by accepted evidence — a
// cost-control measure, Phase 6 Step 17), each with an LLM-proposed
// research question and 1-3 search queries.
//
// The LLM proposes candidate queries; the application decides which
// requirements to research at all and persists the final queries with
// their stated reason. The query text itself is never treated as
// evidence — only what source-retrieval.service.ts actually retrieves
// from executing it can become evidence.
// =====================================================================

import { generateStructured, StructuredGenerationError } from "@/backend/ai/client";
import { GeneratedResearchPlanSchema } from "@/lib/types/schemas";
import type { Evidence, EvidenceRequirement, Hypothesis } from "@/lib/types/domain";

export const RESEARCH_PLANNING_PROMPT_VERSION = "research-planning-v1";

/** A requirement with this many accepted, real evidence items is considered adequately covered already — skip researching it further. */
const ADEQUATE_COVERAGE_THRESHOLD = 2;
/** Hard cap on research tasks generated per hypothesis per run (Phase 6, Step 16). */
export const MAX_RESEARCH_TASKS_PER_HYPOTHESIS = 5;
/** Hard cap on queries per task (Phase 6, Step 16). */
export const MAX_QUERIES_PER_TASK = 3;

const SYSTEM_PROMPT = `You are the research-planning engine inside VentureIQ, a business-idea validation platform.

Given a hypothesis and one specific evidence requirement, propose:
1. A single, sharp research question this requirement is really asking.
2. 1-3 specific web search queries that would help answer it, each with a short reason for why that query.

Rules:
- Queries must be specific to THIS hypothesis and requirement — never generic ("startup market research" is not acceptable).
- Prefer queries likely to surface named competitors, actual pricing pages, government/industry statistics, or news coverage over vague queries.
- Respond with a single JSON object: { "researchQuestion": string, "queries": [ { "query": string, "reason": string } ] } with 1 to 3 queries.`;

function buildUserPrompt(hypothesis: Hypothesis, requirement: EvidenceRequirement): string {
  return [
    `Hypothesis: ${hypothesis.statement}`,
    `Hypothesis category: ${hypothesis.category}`,
    `Validation criteria: ${hypothesis.validationCriteria}`,
    `Evidence requirement: ${requirement.description} (type: ${requirement.evidenceType}, importance: ${requirement.importance})`,
  ].join("\n");
}

export interface RequirementToResearch {
  requirement: EvidenceRequirement;
  researchQuestion: string;
  queries: Array<{ query: string; reason: string }>;
  model: string;
  error?: string;
}

/**
 * Decides which requirements are worth researching (skipping already
 * well-covered ones) and generates a plan for each — never more than
 * MAX_RESEARCH_TASKS_PER_HYPOTHESIS.
 */
export async function planResearch(
  hypothesis: Hypothesis,
  requirements: EvidenceRequirement[],
  existingEvidence: Evidence[],
): Promise<RequirementToResearch[]> {
  const needsResearch = requirements.filter((r) => {
    const linked = existingEvidence.filter(
      (e) =>
        e.evidenceRequirementId === r.id &&
        e.dataStatus !== "demo" &&
        e.dataStatus !== "mock" &&
        e.reviewStatus === "accepted",
    );
    return linked.length < ADEQUATE_COVERAGE_THRESHOLD;
  });

  // Prioritize higher-importance requirements first when trimming to the cap.
  const importanceRank = { critical: 3, high: 2, medium: 1, low: 0 } as const;
  const prioritized = [...needsResearch]
    .sort((a, b) => importanceRank[b.importance] - importanceRank[a.importance])
    .slice(0, MAX_RESEARCH_TASKS_PER_HYPOTHESIS);

  const plans: RequirementToResearch[] = [];
  for (const requirement of prioritized) {
    try {
      const { data, model } = await generateStructured(GeneratedResearchPlanSchema, {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(hypothesis, requirement),
        promptVersion: RESEARCH_PLANNING_PROMPT_VERSION,
        maxTokens: 800,
      });
      plans.push({
        requirement,
        researchQuestion: data.researchQuestion,
        queries: data.queries.slice(0, MAX_QUERIES_PER_TASK),
        model,
      });
    } catch (err) {
      // A planning failure for one requirement shouldn't abort the
      // whole run — the caller records this task as failed and
      // continues with the others.
      if (err instanceof StructuredGenerationError) {
        plans.push({
          requirement,
          researchQuestion: "",
          queries: [],
          model: "",
          error: err.message,
        });
        continue;
      }
      throw err;
    }
  }

  return plans;
}
