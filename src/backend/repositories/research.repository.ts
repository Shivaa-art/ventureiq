import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  ResearchQuery,
  ResearchRun,
  ResearchRunStatus,
  ResearchSource,
  ResearchSourceStatus,
  ResearchTask,
  ResearchTaskStatus,
  SourceCategory,
  UUID,
} from "@/lib/types/domain";

type RunRow = Database["public"]["Tables"]["research_runs"]["Row"];
type TaskRow = Database["public"]["Tables"]["research_tasks"]["Row"];
type QueryRow = Database["public"]["Tables"]["research_queries"]["Row"];
type SourceRow = Database["public"]["Tables"]["research_sources"]["Row"];

function runToDomain(row: RunRow): ResearchRun {
  return {
    id: row.id,
    hypothesisId: row.hypothesis_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    queryCount: row.query_count,
    sourceCount: row.source_count,
    acceptedEvidenceCount: row.accepted_evidence_count,
    error: row.error,
    createdAt: row.created_at,
  };
}

function taskToDomain(row: TaskRow): ResearchTask {
  return {
    id: row.id,
    researchRunId: row.research_run_id,
    hypothesisId: row.hypothesis_id,
    evidenceRequirementId: row.evidence_requirement_id,
    researchQuestion: row.research_question,
    status: row.status,
    priority: row.priority,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function queryToDomain(row: QueryRow): ResearchQuery {
  return {
    id: row.id,
    researchTaskId: row.research_task_id,
    query: row.query,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function sourceToDomain(row: SourceRow): ResearchSource {
  return {
    id: row.id,
    researchTaskId: row.research_task_id,
    researchQueryId: row.research_query_id,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    domain: row.domain,
    publicationDate: row.publication_date,
    retrievalDate: row.retrieval_date,
    snippet: row.snippet,
    sourceCategory: row.source_category,
    sourceFingerprint: row.source_fingerprint,
    qualityScore: Number(row.quality_score),
    status: row.status,
    evidenceId: row.evidence_id,
    createdAt: row.created_at,
  };
}

export class ResearchRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // -- Runs --------------------------------------------------------------

  async createRun(hypothesisId: UUID): Promise<ResearchRun> {
    const { data, error } = await this.db
      .from("research_runs")
      .insert({
        hypothesis_id: hypothesisId,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return runToDomain(data);
  }

  async updateRun(
    id: UUID,
    fields: Partial<{
      status: ResearchRunStatus;
      completedAt: string | null;
      queryCount: number;
      sourceCount: number;
      acceptedEvidenceCount: number;
      error: string | null;
    }>,
  ): Promise<ResearchRun> {
    const patch: Database["public"]["Tables"]["research_runs"]["Update"] = {};
    if (fields.status !== undefined) patch.status = fields.status;
    if (fields.completedAt !== undefined) patch.completed_at = fields.completedAt;
    if (fields.queryCount !== undefined) patch.query_count = fields.queryCount;
    if (fields.sourceCount !== undefined) patch.source_count = fields.sourceCount;
    if (fields.acceptedEvidenceCount !== undefined)
      patch.accepted_evidence_count = fields.acceptedEvidenceCount;
    if (fields.error !== undefined) patch.error = fields.error;

    const { data, error } = await this.db
      .from("research_runs")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return runToDomain(data);
  }

  async listRunsByHypothesis(hypothesisId: UUID): Promise<ResearchRun[]> {
    const { data, error } = await this.db
      .from("research_runs")
      .select()
      .eq("hypothesis_id", hypothesisId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(runToDomain);
  }

  // -- Tasks --------------------------------------------------------------

  async createTask(input: {
    researchRunId: UUID;
    hypothesisId: UUID;
    evidenceRequirementId: UUID | null;
    researchQuestion: string;
    priority: ResearchTask["priority"];
  }): Promise<ResearchTask> {
    const { data, error } = await this.db
      .from("research_tasks")
      .insert({
        research_run_id: input.researchRunId,
        hypothesis_id: input.hypothesisId,
        evidence_requirement_id: input.evidenceRequirementId,
        research_question: input.researchQuestion,
        priority: input.priority,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;
    return taskToDomain(data);
  }

  async updateTaskStatus(
    id: UUID,
    status: ResearchTaskStatus,
    error_?: string | null,
  ): Promise<ResearchTask> {
    const { data, error } = await this.db
      .from("research_tasks")
      .update({ status, error: error_ ?? null })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return taskToDomain(data);
  }

  async listTasksByRun(researchRunId: UUID): Promise<ResearchTask[]> {
    const { data, error } = await this.db
      .from("research_tasks")
      .select()
      .eq("research_run_id", researchRunId);
    if (error) throw error;
    return (data ?? []).map(taskToDomain);
  }

  async listTasksByHypothesis(hypothesisId: UUID): Promise<ResearchTask[]> {
    const { data, error } = await this.db
      .from("research_tasks")
      .select()
      .eq("hypothesis_id", hypothesisId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(taskToDomain);
  }

  // -- Queries --------------------------------------------------------------

  async createQuery(researchTaskId: UUID, query: string, reason: string): Promise<ResearchQuery> {
    const { data, error } = await this.db
      .from("research_queries")
      .insert({ research_task_id: researchTaskId, query, reason })
      .select()
      .single();
    if (error) throw error;
    return queryToDomain(data);
  }

  async listQueriesByTask(researchTaskId: UUID): Promise<ResearchQuery[]> {
    const { data, error } = await this.db
      .from("research_queries")
      .select()
      .eq("research_task_id", researchTaskId);
    if (error) throw error;
    return (data ?? []).map(queryToDomain);
  }

  async listQueriesByTasks(taskIds: UUID[]): Promise<ResearchQuery[]> {
    if (taskIds.length === 0) return [];
    const { data, error } = await this.db
      .from("research_queries")
      .select()
      .in("research_task_id", taskIds);
    if (error) throw error;
    return (data ?? []).map(queryToDomain);
  }

  // -- Sources --------------------------------------------------------------

  async createSource(input: {
    researchTaskId: UUID;
    researchQueryId: UUID | null;
    sourceUrl: string;
    sourceTitle: string | null;
    domain: string | null;
    publicationDate: string | null;
    snippet: string | null;
    sourceCategory: SourceCategory;
    sourceFingerprint: string;
    qualityScore: number;
    status: ResearchSourceStatus;
  }): Promise<ResearchSource> {
    const { data, error } = await this.db
      .from("research_sources")
      .insert({
        research_task_id: input.researchTaskId,
        research_query_id: input.researchQueryId,
        source_url: input.sourceUrl,
        source_title: input.sourceTitle,
        domain: input.domain,
        publication_date: input.publicationDate,
        snippet: input.snippet,
        source_category: input.sourceCategory,
        source_fingerprint: input.sourceFingerprint,
        quality_score: input.qualityScore,
        status: input.status,
      })
      .select()
      .single();
    if (error) throw error;
    return sourceToDomain(data);
  }

  async linkSourceToEvidence(id: UUID, evidenceId: UUID): Promise<void> {
    const { error } = await this.db
      .from("research_sources")
      .update({ evidence_id: evidenceId })
      .eq("id", id);
    if (error) throw error;
  }

  async listSourcesByTask(researchTaskId: UUID): Promise<ResearchSource[]> {
    const { data, error } = await this.db
      .from("research_sources")
      .select()
      .eq("research_task_id", researchTaskId);
    if (error) throw error;
    return (data ?? []).map(sourceToDomain);
  }

  async listSourcesByTasks(taskIds: UUID[]): Promise<ResearchSource[]> {
    if (taskIds.length === 0) return [];
    const { data, error } = await this.db
      .from("research_sources")
      .select()
      .in("research_task_id", taskIds);
    if (error) throw error;
    return (data ?? []).map(sourceToDomain);
  }

  /** Cost control (Phase 6, Step 17): check whether a source with this fingerprint was already retrieved for this hypothesis, to avoid redundant extraction. */
  async findExistingSourceByFingerprint(
    hypothesisId: UUID,
    fingerprint: string,
  ): Promise<ResearchSource | null> {
    const tasks = await this.listTasksByHypothesis(hypothesisId);
    if (tasks.length === 0) return null;
    const { data, error } = await this.db
      .from("research_sources")
      .select()
      .eq("source_fingerprint", fingerprint)
      .in(
        "research_task_id",
        tasks.map((t) => t.id),
      )
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? sourceToDomain(data) : null;
  }
}
