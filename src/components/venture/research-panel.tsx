// =====================================================================
// ResearchPanel — Phase 6, Step 12/13 UI.
//
// Extends the Evidence Workspace with: Research runs -> Tasks ->
// Queries -> Sources found -> Pending/Accepted/Rejected evidence.
// "Research this hypothesis" starts a new run; "Refresh Research"
// starts another (never overwrites prior runs). Every retrieved source
// links out to the original URL. Demo evidence never appears here —
// this panel only ever shows real, externally-researched evidence.
// =====================================================================

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Flag,
  Loader2,
  Search,
  X,
} from "lucide-react";
import type {
  Evidence,
  ResearchQuery,
  ResearchRun,
  ResearchSource,
  ResearchTask,
} from "@/lib/types/domain";
import {
  getResearchWorkspace,
  reviewResearchEvidence,
  startResearch,
} from "@/backend/api/research";

export interface ResearchWorkspaceData {
  runs: ResearchRun[];
  tasks: ResearchTask[];
  queries: ResearchQuery[];
  sources: ResearchSource[];
  externalEvidence: Evidence[];
}

export function ResearchPanel({
  hypothesisId,
  data,
  onChange,
  onEvidenceAccepted,
}: {
  hypothesisId: string;
  data: ResearchWorkspaceData;
  onChange: (next: ResearchWorkspaceData) => void;
  /** Called after an evidence item is accepted, so the parent can refresh coverage/gaps/conflicts. */
  onEvidenceAccepted: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  async function handleResearch() {
    setRunning(true);
    setError(null);
    try {
      const { workspace } = await startResearch({ data: { hypothesisId } });
      onChange(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start research.");
    } finally {
      setRunning(false);
    }
  }

  async function handleReview(evidenceId: string, decision: "accepted" | "rejected" | "flagged") {
    try {
      await reviewResearchEvidence({ data: { evidenceId, decision } });
      const refreshed = await getResearchWorkspace({ data: { hypothesisId } });
      onChange(refreshed);
      if (decision === "accepted") onEvidenceAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record review.");
    }
  }

  const pending = data.externalEvidence.filter((e) => e.reviewStatus === "pending_review");
  const flagged = data.externalEvidence.filter((e) => e.reviewStatus === "flagged");
  const accepted = data.externalEvidence.filter((e) => e.reviewStatus === "accepted");
  const rejected = data.externalEvidence.filter((e) => e.reviewStatus === "rejected");
  const latestRun = data.runs[0];

  return (
    <div className="mt-4 rounded-md border border-border/70 bg-background/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Search className="size-3.5 text-primary" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            External research
          </span>
          {latestRun && <RunStatusBadge status={latestRun.status} />}
        </div>
        <button
          onClick={handleResearch}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Search className="size-3.5" />
          )}
          {data.runs.length > 0 ? "Refresh research" : "Research this hypothesis"}
        </button>
      </div>

      {error && <div className="mt-2 text-xs text-destructive">{error}</div>}

      {data.runs.length === 0 && !running && (
        <div className="mt-2 text-xs text-muted-foreground">
          This hypothesis has not been researched yet.
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-amber-500">
            Pending review ({pending.length})
          </div>
          {pending.map((e) => (
            <ExternalEvidenceRow key={e.id} evidence={e} onReview={(d) => handleReview(e.id, d)} />
          ))}
        </div>
      )}

      {flagged.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-orange-500">
            Flagged ({flagged.length})
          </div>
          {flagged.map((e) => (
            <ExternalEvidenceRow key={e.id} evidence={e} onReview={(d) => handleReview(e.id, d)} />
          ))}
        </div>
      )}

      {accepted.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="font-mono text-[9px] uppercase tracking-widest text-primary">
            Accepted ({accepted.length})
          </div>
          {accepted.map((e) => (
            <ExternalEvidenceRow key={e.id} evidence={e} />
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <button
          onClick={() => setExpanded((s) => ({ ...s, rejected: !s.rejected }))}
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded.rejected ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          {rejected.length} rejected
        </button>
      )}
      {expanded.rejected && (
        <div className="mt-2 space-y-2">
          {rejected.map((e) => (
            <ExternalEvidenceRow key={e.id} evidence={e} />
          ))}
        </div>
      )}

      {data.tasks.length > 0 && (
        <button
          onClick={() => setExpanded((s) => ({ ...s, tasks: !s.tasks }))}
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded.tasks ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          Research detail ({data.tasks.length} task{data.tasks.length === 1 ? "" : "s"})
        </button>
      )}
      {expanded.tasks && (
        <div className="mt-2 space-y-3">
          {data.tasks.map((t) => (
            <TaskDetail
              key={t.id}
              task={t}
              queries={data.queries.filter((q) => q.researchTaskId === t.id)}
              sources={data.sources.filter((s) => s.researchTaskId === t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RunStatusBadge({ status }: { status: ResearchRun["status"] }) {
  const colors: Record<string, string> = {
    queued: "border-border text-muted-foreground",
    running: "border-blue-500/40 text-blue-500",
    completed: "border-primary/40 text-primary",
    partial: "border-amber-500/40 text-amber-500",
    failed: "border-destructive/40 text-destructive",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${colors[status]}`}
    >
      {status}
    </span>
  );
}

function ExternalEvidenceRow({
  evidence: e,
  onReview,
}: {
  evidence: Evidence;
  onReview?: (decision: "accepted" | "rejected" | "flagged") => void;
}) {
  const directionColor =
    e.supportDirection === "supports"
      ? "border-primary/40 text-primary"
      : e.supportDirection === "contradicts"
        ? "border-destructive/40 text-destructive"
        : "border-border text-muted-foreground";
  return (
    <div className="rounded-md border border-border p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${directionColor}`}
        >
          {e.supportDirection}
        </span>
        {e.reviewStatus === "flagged" && (
          <span className="rounded border border-orange-500/50 bg-orange-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-orange-500">
            <Flag className="mr-1 inline size-2.5" />
            Flagged
          </span>
        )}
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          quality {Math.round(e.reliabilityScore)}
        </span>
      </div>
      <p className="mt-1.5">{e.summary}</p>
      {e.classificationReason && (
        <p className="mt-1 text-[10px] italic text-muted-foreground/80">{e.classificationReason}</p>
      )}
      {e.sourceUrl && (
        <a
          href={e.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="size-3" />
          {e.sourceTitle || e.sourceUrl}
        </a>
      )}
      {onReview && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onReview("accepted")}
            className="inline-flex items-center gap-1 rounded border border-primary/40 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10"
          >
            <Check className="size-3" /> Accept
          </button>
          <button
            onClick={() => onReview("rejected")}
            className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-1 text-[10px] font-semibold text-destructive hover:bg-destructive/10"
          >
            <X className="size-3" /> Reject
          </button>
          {e.reviewStatus !== "flagged" && (
            <button
              onClick={() => onReview("flagged")}
              className="inline-flex items-center gap-1 rounded border border-orange-500/40 px-2 py-1 text-[10px] font-semibold text-orange-500 hover:bg-orange-500/10"
              title="Flag for later review — stays visible, excluded from scoring"
            >
              <Flag className="size-3" /> Flag
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TaskDetail({
  task,
  queries,
  sources,
}: {
  task: ResearchTask;
  queries: ResearchQuery[];
  sources: ResearchSource[];
}) {
  return (
    <div className="rounded-md border border-border p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">{task.researchQuestion}</span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {task.status}
        </span>
      </div>
      {task.error && <p className="mt-1 text-destructive">{task.error}</p>}
      {queries.length > 0 && (
        <div className="mt-2 space-y-1">
          {queries.map((q) => (
            <div key={q.id} className="text-muted-foreground">
              <span className="font-mono text-[9px]">Query:</span> "{q.query}" — {q.reason}
            </div>
          ))}
        </div>
      )}
      {sources.length > 0 && (
        <div className="mt-2 space-y-1">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-muted-foreground">
              <span className="font-mono text-[9px] uppercase tracking-widest">{s.status}</span>
              <a
                href={s.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-primary hover:underline"
              >
                {s.sourceTitle || s.sourceUrl}
              </a>
              <span className="font-mono text-[9px]">
                ({s.sourceCategory}, quality {Math.round(s.qualityScore)})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
