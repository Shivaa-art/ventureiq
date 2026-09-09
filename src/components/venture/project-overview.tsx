// =====================================================================
// ProjectOverview — Phase 5, Step 17/18 UI.
//
// Renders the decision-support hierarchy: Project Overview (opportunity
// score, overall confidence, coverage) -> Critical Uncertainties ->
// Recommended Next Action -> Human Decision. Every score has a "Why?"
// disclosure built from the same stored calculation factors the
// deterministic engines produced — never a freshly-generated
// explanation that could drift from the actual numbers.
// =====================================================================

import { useState } from "react";
import {
  AlertOctagon,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Gauge,
  Loader2,
  RefreshCw,
  Target,
} from "lucide-react";
import type {
  CriticalUncertainty,
  Decision,
  OpportunityScore,
  ProjectConfidenceSummary,
  UserDecision,
  ValidationAction,
} from "@/lib/types/domain";
import {
  getProjectOverview,
  recalculateProject,
  recordDecision,
  recordValidationResult,
} from "@/backend/api/scoring";

export interface ProjectOverviewData {
  projectConfidence: ProjectConfidenceSummary;
  criticalUncertainties: CriticalUncertainty[];
  opportunityScore: OpportunityScore | null;
  decision: UserDecision | null;
  validationActions: ValidationAction[];
}

export function ProjectOverview({
  businessIdeaId,
  data,
  onChange,
}: {
  businessIdeaId: string;
  data: ProjectOverviewData;
  onChange: (next: ProjectOverviewData) => void;
}) {
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRecalculate() {
    setRecalculating(true);
    setError(null);
    try {
      await recalculateProject({ data: { businessIdeaId } });
      const refreshed = await getProjectOverview({ data: { businessIdeaId } });
      onChange(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recalculate.");
    } finally {
      setRecalculating(false);
    }
  }

  const topAction = data.validationActions.find((a) => a.status === "recommended");

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* PROJECT OVERVIEW */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <SectionHeading icon={Compass} label="Project overview" />
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {recalculating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Recalculate
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Opportunity score"
            value={data.opportunityScore ? Math.round(data.opportunityScore.overallScore) : null}
            sub={
              data.opportunityScore
                ? `Raw ${Math.round(data.opportunityScore.rawScore)} · Confidence ${Math.round(data.opportunityScore.overallConfidence)}%`
                : "Not yet calculated"
            }
          />
          <MetricCard
            label="Overall confidence"
            value={Math.round(data.projectConfidence.overallConfidence)}
            sub={
              data.projectConfidence.criticalHypothesisConfidence != null
                ? `Critical hypotheses: ${Math.round(data.projectConfidence.criticalHypothesisConfidence)}%`
                : "No critical hypotheses"
            }
          />
          <MetricCard
            label="Evidence coverage"
            value={Math.round(data.projectConfidence.evidenceCoveragePct)}
            sub="Importance-weighted"
          />
        </div>
        {data.opportunityScore && <OpportunityBreakdown score={data.opportunityScore} />}
      </div>

      {/* CRITICAL UNCERTAINTIES */}
      <div className="rounded-xl border border-border bg-card p-5">
        <SectionHeading icon={AlertOctagon} label="Critical uncertainties" />
        <p className="mt-1 text-xs text-muted-foreground">What is still unknown?</p>
        <div className="mt-3 space-y-2">
          {data.criticalUncertainties.slice(0, 5).map((u) => (
            <div key={u.hypothesisId} className="rounded-md border border-border p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{u.statement}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  score {Math.round(u.uncertaintyScore)}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{u.reason}</p>
            </div>
          ))}
          {data.criticalUncertainties.length === 0 && (
            <div className="text-xs text-muted-foreground">No hypotheses scored yet.</div>
          )}
        </div>
      </div>

      {/* RECOMMENDED NEXT ACTION */}
      <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-5">
        <SectionHeading icon={Target} label="Recommended next validation" />
        {topAction ? (
          <RecommendedAction action={topAction} onRecorded={(next) => onChange(next)} />
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            No open validation actions right now.
          </p>
        )}
        {data.validationActions.length > 1 && (
          <OtherActions actions={data.validationActions.filter((a) => a.id !== topAction?.id)} />
        )}
      </div>

      {/* HUMAN DECISION */}
      <HumanDecisionPanel
        businessIdeaId={businessIdeaId}
        decision={data.decision}
        onChange={onChange}
        data={data}
      />
    </div>
  );
}

function SectionHeading({ icon: Icon, label }: { icon: typeof Compass; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-primary" />
      <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </h3>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: number | null; sub: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "—"}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function OpportunityBreakdown({ score }: { score: OpportunityScore }) {
  const [open, setOpen] = useState(false);
  const dims = Object.entries(score.dimensions).filter(([, d]) => d.applicable);

  return (
    <div className="mt-4 border-t border-border pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        Why is opportunity score {Math.round(score.overallScore)}?
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {dims.map(([key, d]) => (
            <div key={key} className="rounded-md border border-border p-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{key.replace(/_/g, " ")}</span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  score {Math.round(d.score)} · confidence {Math.round(d.confidence)}%
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{d.reasoning}</p>
              {d.limitation && <p className="mt-1 text-amber-500">{d.limitation}</p>}
            </div>
          ))}
          {dims.length === 0 && (
            <div className="text-xs text-muted-foreground">
              No applicable dimensions scored yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecommendedAction({
  action,
  onRecorded,
}: {
  action: ValidationAction;
  onRecorded: (next: ProjectOverviewData) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const priorityColor: Record<string, string> = {
    critical: "border-destructive/40 text-destructive",
    high: "border-amber-500/40 text-amber-500",
    medium: "border-blue-500/40 text-blue-500",
    low: "border-border text-muted-foreground",
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${priorityColor[action.priority]}`}
        >
          {action.priority}
        </span>
        <span className="text-sm font-semibold">{action.actionTitle}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{action.actionDescription}</p>
      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {action.estimatedCost && <span>Cost: {action.estimatedCost}</span>}
        {action.estimatedTime && <span>Time: {action.estimatedTime}</span>}
        <span>Value: {Math.round(action.expectedInformationValue)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        <button
          onClick={() => setShowWhy((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          Why this action?
        </button>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          Record result
        </button>
      </div>
      {showWhy && (
        <p className="mt-2 rounded-md border border-border p-2.5 text-xs text-muted-foreground">
          {action.reasoning}
        </p>
      )}
      {showForm && action.hypothesisId && (
        <RecordResultForm
          validationActionId={action.id}
          hypothesisId={action.hypothesisId}
          onDone={(next) => {
            onRecorded(next);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function OtherActions({ actions }: { actions: ValidationAction[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-border pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {actions.length} other candidate action(s)
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {actions.map((a) => (
            <div key={a.id} className="rounded-md border border-border p-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.actionTitle}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {a.priority}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{a.actionDescription}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordResultForm({
  validationActionId,
  hypothesisId,
  onDone,
}: {
  validationActionId: string;
  hypothesisId: string;
  onDone: (next: ProjectOverviewData) => void;
}) {
  const [result, setResult] = useState("");
  const [outcome, setOutcome] = useState<"supports" | "contradicts" | "neutral">("neutral");
  const [notes, setNotes] = useState("");
  const [supportingData, setSupportingData] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (result.trim().length < 5) return;
    setSubmitting(true);
    setError(null);
    try {
      const next = await recordValidationResult({
        data: {
          validationActionId,
          hypothesisId,
          outcome,
          result,
          notes: notes || null,
          supportingData: supportingData || null,
        },
      });
      onDone({
        projectConfidence: next.projectConfidence,
        criticalUncertainties: next.criticalUncertainties,
        opportunityScore: next.opportunityScore,
        decision: null,
        validationActions: next.validationActions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record result.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20";

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-2 rounded-md border border-border bg-background/50 p-3"
    >
      {error && <div className="text-xs text-destructive">{error}</div>}
      <textarea
        className={`${inputClass} min-h-16 resize-y`}
        placeholder="What happened? (result summary)"
        value={result}
        onChange={(e) => setResult(e.target.value)}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className={inputClass}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as typeof outcome)}
        >
          <option value="supports">Supports the hypothesis</option>
          <option value="contradicts">Contradicts the hypothesis</option>
          <option value="neutral">Neutral / inconclusive</option>
        </select>
        <input
          className={inputClass}
          placeholder="Supporting data URL (optional)"
          value={supportingData}
          onChange={(e) => setSupportingData(e.target.value)}
        />
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
        Save result & recalculate
      </button>
    </form>
  );
}

function HumanDecisionPanel({
  businessIdeaId,
  decision,
  data,
  onChange,
}: {
  businessIdeaId: string;
  decision: UserDecision | null;
  data: ProjectOverviewData;
  onChange: (next: ProjectOverviewData) => void;
}) {
  const [choice, setChoice] = useState<Decision>(decision?.decision ?? "validate_further");
  const [notes, setNotes] = useState(decision?.notes ?? "");
  const [basis, setBasis] = useState(decision?.decisionBasis ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const saved = await recordDecision({
        data: {
          businessIdeaId,
          decision: choice,
          notes: notes || undefined,
          decisionBasis: basis || undefined,
        },
      });
      onChange({ ...data, decision: saved });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record decision.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <SectionHeading icon={Gauge} label="Human decision" />
      <p className="mt-1 text-xs text-muted-foreground">
        VentureIQ provides decision support — the entrepreneur remains the final decision maker.
      </p>
      {decision && (
        <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs">
          Current decision:{" "}
          <span className="font-semibold">{decision.decision.replace(/_/g, " ")}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-3 space-y-2">
        {error && <div className="text-xs text-destructive">{error}</div>}
        <select
          className={inputClass}
          value={choice}
          onChange={(e) => setChoice(e.target.value as Decision)}
        >
          <option value="proceed">Proceed</option>
          <option value="validate_further">Validate further</option>
          <option value="modify_idea">Modify idea</option>
          <option value="reject">Reject</option>
        </select>
        <textarea
          className={`${inputClass} min-h-12 resize-y`}
          placeholder="Decision basis — what is this grounded in?"
          value={basis}
          onChange={(e) => setBasis(e.target.value)}
        />
        <textarea
          className={`${inputClass} min-h-12 resize-y`}
          placeholder="Additional notes (optional)"
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
          Record decision
        </button>
      </form>
    </div>
  );
}
