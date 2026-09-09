// =====================================================================
// EvidenceWorkspace — Phase 4, Step 12/13 UI.
//
// Rendered per-hypothesis inside the approved-plan view
// (src/routes/analysis.$id.tsx). Shows coverage, supporting/
// contradicting/neutral evidence, gaps, and conflicts; lets the
// founder add/edit/delete evidence and trigger demo collection /
// re-evaluation. Demo evidence is always visibly labeled "DEMO DATA".
// =====================================================================

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  Evidence,
  EvidenceConflict,
  EvidenceCoverage,
  EvidenceGap,
  Hypothesis,
  SourceType,
  SupportDirection,
} from "@/lib/types/domain";
import {
  addUserEvidence,
  collectDemoEvidence,
  deleteEvidence,
  reevaluateEvidence,
} from "@/backend/api/evidence";
import { getResearchWorkspace } from "@/backend/api/research";
import { ResearchPanel, type ResearchWorkspaceData } from "@/components/venture/research-panel";

const EVIDENCE_TYPES: SourceType[] = [
  "customer_feedback",
  "survey",
  "interview",
  "competitor",
  "market_data",
  "pricing",
  "financial",
  "regulatory",
  "government",
  "experiment",
  "other",
];

export interface EvidenceWorkspaceData {
  evidence: Evidence[];
  coverage: EvidenceCoverage;
  gaps: EvidenceGap[];
  conflicts: EvidenceConflict[];
}

export function EvidenceWorkspace({
  hypothesis,
  data,
  onChange,
}: {
  hypothesis: Hypothesis;
  data: EvidenceWorkspaceData;
  onChange: (next: EvidenceWorkspaceData) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [research, setResearch] = useState<ResearchWorkspaceData | null>(null);

  const { evidence, coverage, gaps, conflicts } = data;
  const openConflicts = conflicts.filter((c) => c.status === "open");
  const openGaps = gaps.filter((g) => g.status === "open");

  useEffect(() => {
    if (expanded && !research) {
      getResearchWorkspace({ data: { hypothesisId: hypothesis.id } })
        .then(setResearch)
        .catch(() => {
          /* research panel simply stays empty if this fails; not fatal to the evidence workspace */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function runAndApply(fn: () => Promise<EvidenceWorkspaceData>) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      onChange(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCollectDemo() {
    await runAndApply(async () => {
      const result = await collectDemoEvidence({ data: { hypothesisId: hypothesis.id } });
      return {
        evidence: result.evidence,
        coverage: result.coverage,
        gaps: result.gaps,
        conflicts: result.conflicts,
      };
    });
  }

  async function handleReevaluate() {
    await runAndApply(async () => {
      const result = await reevaluateEvidence({ data: { hypothesisId: hypothesis.id } });
      return {
        evidence: result.evidence,
        coverage: result.coverage,
        gaps: result.gaps,
        conflicts: result.conflicts,
      };
    });
  }

  async function handleDelete(evidenceId: string) {
    if (!confirm("Delete this evidence item? This cannot be undone.")) return;
    await runAndApply(async () => {
      const result = await deleteEvidence({ data: { evidenceId } });
      return {
        evidence: result.evidence,
        coverage: result.coverage,
        gaps: result.gaps,
        conflicts: result.conflicts,
      };
    });
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <span className="text-sm font-medium">{hypothesis.statement}</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest">
          <CoverageBadge coverage={coverage.coveragePct} />
          {openConflicts.length > 0 && (
            <span className="rounded border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive">
              {openConflicts.length} conflict{openConflicts.length > 1 ? "s" : ""}
            </span>
          )}
          {openGaps.length > 0 && (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-500">
              {openGaps.length} gap{openGaps.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 flex-none" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              <Plus className="size-3.5" />
              Add evidence
            </button>
            <button
              onClick={handleCollectDemo}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Sparkles className="size-3.5" />
              Collect demo evidence
            </button>
            <button
              onClick={handleReevaluate}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Re-evaluate evidence
            </button>
          </div>

          {showForm && (
            <AddEvidenceForm
              hypothesisId={hypothesis.id}
              onCancel={() => setShowForm(false)}
              onSubmit={async (input) => {
                await runAndApply(async () => {
                  const result = await addUserEvidence({ data: input });
                  return {
                    evidence: result.evidence,
                    coverage: result.coverage,
                    gaps: result.gaps,
                    conflicts: result.conflicts,
                  };
                });
                setShowForm(false);
              }}
            />
          )}

          <div className="space-y-2">
            <SectionLabel>Evidence conflicts</SectionLabel>
            {openConflicts.length === 0 ? (
              <div className="text-xs text-muted-foreground">No evidence conflicts detected.</div>
            ) : (
              openConflicts.map((c) => (
                <div
                  key={c.id}
                  className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={c.severity} />
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {c.conflictType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1.5">{c.description}</p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <SectionLabel>Evidence gaps</SectionLabel>
            {openGaps.length === 0 ? (
              <div className="text-xs text-muted-foreground">No evidence gaps detected.</div>
            ) : (
              openGaps.map((g) => (
                <div
                  key={g.id}
                  className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={g.severity} />
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {g.gapType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1.5">{g.businessImpact}</p>
                  <p className="mt-1 text-muted-foreground">
                    Recommended: {g.recommendedValidation}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <SectionLabel>Evidence ({evidence.length})</SectionLabel>
            {evidence.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No evidence has been collected yet.
              </div>
            )}
            {evidence.map((e) => (
              <EvidenceRow key={e.id} evidence={e} onDelete={() => handleDelete(e.id)} />
            ))}
          </div>

          {research && (
            <ResearchPanel
              hypothesisId={hypothesis.id}
              data={research}
              onChange={setResearch}
              onEvidenceAccepted={handleReevaluate}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceRow({ evidence: e, onDelete }: { evidence: Evidence; onDelete: () => void }) {
  const isDemo = e.dataStatus === "demo" || e.dataStatus === "mock";
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-xs">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <DirectionBadge direction={e.supportDirection} />
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {e.sourceType.replace(/_/g, " ")}
          </span>
          {isDemo && (
            <span className="rounded border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-amber-500">
              DEMO DATA
            </span>
          )}
          {e.dataStatus === "user_provided" && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Founder-provided
            </span>
          )}
        </div>
        <p className="mt-1.5 font-medium">{e.sourceTitle || e.source}</p>
        <p className="mt-0.5 text-muted-foreground">{e.summary}</p>
        {e.classificationReason && (
          <p className="mt-1 text-[10px] italic text-muted-foreground/80">
            {e.classificationReason}
          </p>
        )}
        {e.sourceUrl && (
          <a
            href={e.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-primary hover:underline"
          >
            {e.sourceUrl}
          </a>
        )}
      </div>
      <button
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive"
        title="Delete evidence"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function AddEvidenceForm({
  hypothesisId,
  onCancel,
  onSubmit,
}: {
  hypothesisId: string;
  onCancel: () => void;
  onSubmit: (input: {
    hypothesisId: string;
    title: string;
    description: string;
    source: string;
    sourceUrl?: string | null;
    evidenceType: SourceType;
    publicationDate?: string | null;
    notes?: string | null;
    supportDirection: SupportDirection;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [evidenceType, setEvidenceType] = useState<SourceType>("customer_feedback");
  const [publicationDate, setPublicationDate] = useState("");
  const [notes, setNotes] = useState("");
  const [supportDirection, setSupportDirection] = useState<SupportDirection>("neutral");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || description.trim().length < 10 || !source.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        hypothesisId,
        title,
        description,
        source,
        sourceUrl: sourceUrl || null,
        evidenceType,
        publicationDate: publicationDate || null,
        notes: notes || null,
        supportDirection,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border border-border bg-background/50 p-3"
    >
      <div className="flex items-center justify-between">
        <SectionLabel>Add evidence</SectionLabel>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={inputClass}
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className={inputClass}
          value={evidenceType}
          onChange={(e) => setEvidenceType(e.target.value as SourceType)}
        >
          {EVIDENCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className={`${inputClass} min-h-16 resize-y`}
        placeholder="Description — what does this evidence say?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={inputClass}
          placeholder="Source (e.g. 'Customer interview, 12 Aug')"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="URL (optional)"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="date"
          className={inputClass}
          value={publicationDate}
          onChange={(e) => setPublicationDate(e.target.value)}
        />
        <select
          className={inputClass}
          value={supportDirection}
          onChange={(e) => setSupportDirection(e.target.value as SupportDirection)}
        >
          <option value="supports">Supports</option>
          <option value="contradicts">Contradicts</option>
          <option value="neutral">Neutral</option>
        </select>
      </div>
      <textarea
        className={`${inputClass} min-h-12 resize-y`}
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
        Save evidence
      </button>
    </form>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function CoverageBadge({ coverage }: { coverage: number }) {
  const color =
    coverage >= 70
      ? "text-primary border-primary/40"
      : coverage >= 30
        ? "text-amber-500 border-amber-500/40"
        : "text-muted-foreground border-border";
  return <span className={`rounded border px-2 py-0.5 ${color}`}>{coverage}% coverage</span>;
}

function SeverityBadge({ severity }: { severity: "low" | "medium" | "high" | "critical" }) {
  const colors: Record<string, string> = {
    low: "border-border text-muted-foreground",
    medium: "border-blue-500/40 text-blue-500",
    high: "border-amber-500/40 text-amber-500",
    critical: "border-destructive/40 text-destructive",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${colors[severity]}`}
    >
      {severity}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: SupportDirection }) {
  const map = {
    supports: { label: "Supports", cls: "border-primary/40 text-primary" },
    contradicts: { label: "Contradicts", cls: "border-destructive/40 text-destructive" },
    neutral: { label: "Neutral", cls: "border-border text-muted-foreground" },
  } as const;
  const { label, cls } = map[direction];
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${cls}`}
    >
      {label}
    </span>
  );
}
