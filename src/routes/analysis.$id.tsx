import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/venture/app-shell";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  EvidenceWorkspace,
  type EvidenceWorkspaceData,
} from "@/components/venture/evidence-workspace";
import { ProjectOverview, type ProjectOverviewData } from "@/components/venture/project-overview";
import { getEvidenceOverview } from "@/backend/api/evidence";
import { getProjectOverview, recalculateProject } from "@/backend/api/scoring";
import {
  runValidationPipeline,
  getValidationPlan,
  approveValidationPlan,
  updateHypothesis,
  deleteHypothesis,
  updateEvidenceRequirement,
  deleteEvidenceRequirement,
  removeAssumption,
} from "@/backend/api/validation-plan";
import type {
  BusinessAssumption,
  EvidenceRequirement,
  Hypothesis,
  Importance,
  MinimumEvidenceLevel,
  UUID,
} from "@/lib/types/domain";

export const Route = createFileRoute("/analysis/$id")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "Analyzing — VentureIQ" },
      {
        name: "description",
        content:
          "VentureIQ is structuring your idea into testable hypotheses and evidence requirements.",
      },
      { property: "og:title", content: "Analyzing your idea — VentureIQ" },
      { property: "og:description", content: "Live validation in progress." },
    ],
  }),
  component: AnalysisPage,
});

type ScreenState = "running" | "failed" | "review" | "evidence";

const STAGE_LABELS: Record<string, string> = {
  idea_structuring: "Structuring business idea",
  assumption_extraction: "Extracting assumptions",
  hypothesis_generation: "Generating hypotheses",
  evidence_requirement_generation: "Generating evidence requirements",
};
const STAGE_ORDER = [
  "idea_structuring",
  "assumption_extraction",
  "hypothesis_generation",
  "evidence_requirement_generation",
];

type PlanData = Awaited<ReturnType<typeof getValidationPlan>>;

function AnalysisPage() {
  const { id } = useParams({ from: "/analysis/$id" });
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const [screen, setScreen] = useState<ScreenState>("running");
  const [stageResults, setStageResults] = useState<
    Record<string, { status: "completed" | "failed"; error?: string }>
  >({});
  const [runError, setRunError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [approving, setApproving] = useState(false);
  const [evidenceOverview, setEvidenceOverview] = useState<Record<string, EvidenceWorkspaceData>>(
    {},
  );
  const [projectOverview, setProjectOverview] = useState<ProjectOverviewData | null>(null);

  async function loadEvidenceOverview(hypotheses: PlanData["hypotheses"]) {
    if (hypotheses.length === 0) {
      setEvidenceOverview({});
      return;
    }
    const overview = await getEvidenceOverview({
      data: { hypothesisIds: hypotheses.map((h) => h.id) },
    });
    const next: Record<string, EvidenceWorkspaceData> = {};
    for (const h of hypotheses) {
      next[h.id] = {
        evidence: overview.evidenceByHypothesis[h.id] ?? [],
        coverage: overview.coverageByHypothesis[h.id],
        gaps: overview.gaps.filter((g) => g.hypothesisId === h.id),
        conflicts: overview.conflicts.filter((c) => c.hypothesisId === h.id),
      };
    }
    setEvidenceOverview(next);
  }

  async function loadProjectOverview() {
    const overview = await getProjectOverview({ data: { businessIdeaId: id } });
    setProjectOverview(overview);
  }

  async function runPipeline() {
    setScreen("running");
    setRunError(null);
    setStageResults({});
    try {
      const summary = await runValidationPipeline({ data: { businessIdeaId: id } });
      const results: Record<string, { status: "completed" | "failed"; error?: string }> = {};
      for (const s of summary.stages) {
        results[s.stage] = { status: s.status, error: s.error };
      }
      setStageResults(results);

      if (summary.stoppedEarly) {
        setScreen("failed");
        return;
      }

      const fetchedPlan = await getValidationPlan({ data: { businessIdeaId: id } });
      setPlan(fetchedPlan);

      if (fetchedPlan.businessIdea.planStatus === "approved") {
        await loadEvidenceOverview(fetchedPlan.hypotheses);
        await loadProjectOverview();
        setScreen("evidence");
      } else {
        setScreen("review");
      }
    } catch (err) {
      setRunError(
        err instanceof Error
          ? err.message
          : "Something went wrong running the validation pipeline.",
      );
      setScreen("failed");
    }
  }

  useEffect(() => {
    runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleApprove() {
    setApproving(true);
    try {
      await approveValidationPlan({ data: { businessIdeaId: id } });
      if (plan) {
        await loadEvidenceOverview(plan.hypotheses);
      }
      // Establish a baseline confidence/opportunity/next-action reading
      // as soon as the plan is approved, before any evidence has been
      // added — this makes the "why is confidence low" answer available
      // immediately (no evidence yet -> low coverage -> low confidence),
      // rather than showing blank panels.
      await recalculateProject({ data: { businessIdeaId: id } });
      await loadProjectOverview();
      setScreen("evidence");
    } catch (err) {
      setRunError(
        err instanceof Error ? err.message : "Could not approve the plan. Please try again.",
      );
    } finally {
      setApproving(false);
    }
  }

  if (screen === "running") {
    return (
      <AppShell title="Analysis in progress" breadcrumb="// Home / Analysis" user={user}>
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-2xl border border-border bg-card p-10">
            <div className="font-mono text-[10px] uppercase tracking-widest text-primary">
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Live · running
              </span>
            </div>
            <h2 className="mt-6 text-3xl font-semibold tracking-tight">Structuring your idea…</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              VentureIQ is parsing your idea, extracting assumptions, and generating testable
              hypotheses with domain-specific evidence requirements. This calls the model several
              times in sequence, so it can take a minute.
            </p>

            <ul className="mt-10 space-y-3 font-mono text-sm">
              <li className="flex items-center gap-3">
                <span className="inline-flex size-5 items-center justify-center rounded-full border border-primary bg-primary text-[10px] text-primary-foreground">
                  ✓
                </span>
                <span className="text-foreground">Business idea received</span>
              </li>
              {STAGE_ORDER.map((stageId) => {
                const result = stageResults[stageId];
                const done = result?.status === "completed";
                const failed = result?.status === "failed";
                return (
                  <li key={stageId} className="flex items-center gap-3">
                    <span
                      className={`inline-flex size-5 items-center justify-center rounded-full border text-[10px] ${
                        done
                          ? "border-primary bg-primary text-primary-foreground"
                          : failed
                            ? "border-destructive bg-destructive text-destructive-foreground"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {done ? "✓" : failed ? "✕" : ""}
                    </span>
                    <span className={done || failed ? "text-foreground" : "text-muted-foreground"}>
                      {STAGE_LABELS[stageId]}
                    </span>
                    {!done && !failed && (
                      <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />
                    )}
                  </li>
                );
              })}
              <li className="flex items-center gap-3 opacity-50">
                <span className="inline-flex size-5 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground" />
                <span className="text-muted-foreground">Waiting for entrepreneur approval</span>
              </li>
            </ul>
          </div>
        </div>
      </AppShell>
    );
  }

  if (screen === "failed") {
    const failedStage = Object.entries(stageResults).find(([, r]) => r.status === "failed");
    return (
      <AppShell title="Analysis failed" breadcrumb="// Home / Analysis" user={user}>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-10 text-center">
            <AlertTriangle className="mx-auto size-8 text-destructive" />
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              {failedStage
                ? `Failed at: ${STAGE_LABELS[failedStage[0]] ?? failedStage[0]}`
                : "Something went wrong"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {failedStage?.[1].error ?? runError ?? "The validation pipeline could not complete."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Nothing was fabricated to fill the gap — any earlier stages that did complete are
              saved. You can retry.
            </p>
            <button
              onClick={runPipeline}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110"
            >
              <RefreshCw className="size-4" />
              Retry
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (screen === "evidence") {
    if (!plan) return null;
    return (
      <AppShell title="Evidence workspace" breadcrumb="// Home / Analysis / Evidence" user={user}>
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
          <div className="flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
            <CheckCircle2 className="size-5 flex-none text-primary" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-primary">
                // validation plan approved
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Collect or add evidence for each hypothesis below. Coverage, gaps, and conflicts
                update as evidence changes. Demo evidence is always clearly labeled and never
                counted as real research.
              </p>
            </div>
          </div>

          {projectOverview && (
            <ProjectOverview
              businessIdeaId={id}
              data={projectOverview}
              onChange={setProjectOverview}
            />
          )}

          <div className="space-y-3">
            {plan.hypotheses.map((h) => {
              const workspaceData = evidenceOverview[h.id];
              if (!workspaceData) return null;
              return (
                <EvidenceWorkspace
                  key={h.id}
                  hypothesis={h}
                  data={workspaceData}
                  onChange={(next) => setEvidenceOverview((prev) => ({ ...prev, [h.id]: next }))}
                />
              );
            })}
            {plan.hypotheses.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                No hypotheses to collect evidence for.
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => navigate({ href: "/dashboard" })}
              className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  // screen === "review"
  if (!plan) return null;
  return (
    <PlanReview
      user={user}
      plan={plan}
      setPlan={setPlan}
      approving={approving}
      onApprove={handleApprove}
      error={runError}
    />
  );
}

function PlanReview({
  user,
  plan,
  setPlan,
  approving,
  onApprove,
  error,
}: {
  user: NonNullable<ReturnType<typeof Route.useRouteContext>>["user"];
  plan: PlanData;
  setPlan: (p: PlanData) => void;
  approving: boolean;
  onApprove: () => void;
  error: string | null;
}) {
  const { businessIdea, assumptions, hypotheses, requirementsByHypothesis } = plan;
  const structured = businessIdea.structured;

  async function handleAssumptionRemove(assumptionId: UUID) {
    await removeAssumption({ data: { assumptionId } });
    setPlan({ ...plan, assumptions: plan.assumptions.filter((a) => a.id !== assumptionId) });
  }

  async function handleHypothesisImportance(hypothesisId: UUID, importance: Importance) {
    const updated = await updateHypothesis({ data: { hypothesisId, importance } });
    setPlan({
      ...plan,
      hypotheses: plan.hypotheses.map((h) => (h.id === hypothesisId ? updated : h)),
    });
  }

  async function handleHypothesisDelete(hypothesisId: UUID) {
    await deleteHypothesis({ data: { hypothesisId } });
    const { [hypothesisId]: _removed, ...restRequirements } = requirementsByHypothesis;
    setPlan({
      ...plan,
      hypotheses: plan.hypotheses.filter((h) => h.id !== hypothesisId),
      requirementsByHypothesis: restRequirements,
    });
  }

  async function handleRequirementLevel(
    hypothesisId: UUID,
    requirementId: UUID,
    level: MinimumEvidenceLevel,
  ) {
    const updated = await updateEvidenceRequirement({
      data: { requirementId, minimumEvidenceLevel: level },
    });
    setPlan({
      ...plan,
      requirementsByHypothesis: {
        ...requirementsByHypothesis,
        [hypothesisId]: (requirementsByHypothesis[hypothesisId] ?? []).map((r) =>
          r.id === requirementId ? updated : r,
        ),
      },
    });
  }

  async function handleRequirementDelete(hypothesisId: UUID, requirementId: UUID) {
    await deleteEvidenceRequirement({ data: { requirementId } });
    setPlan({
      ...plan,
      requirementsByHypothesis: {
        ...requirementsByHypothesis,
        [hypothesisId]: (requirementsByHypothesis[hypothesisId] ?? []).filter(
          (r) => r.id !== requirementId,
        ),
      },
    });
  }

  return (
    <AppShell title="Review validation plan" breadcrumb="// Home / Analysis / Review" user={user}>
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <div className="flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
          <Sparkles className="size-5 flex-none text-primary" />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-primary">
              // waiting for entrepreneur approval
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the structured idea, assumptions, hypotheses, and evidence requirements below.
              Edit importance or evidence level, remove anything irrelevant, then approve to lock in
              this validation plan.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 flex-none" />
            <span>{error}</span>
          </div>
        )}

        {structured && (
          <Card title="Structured business idea" code="01">
            <div className="grid gap-4 p-6 text-sm md:grid-cols-2">
              <SummaryField label="Industry" value={structured.industry} />
              <SummaryField
                label="Location"
                value={[
                  structured.location.city,
                  structured.location.state,
                  structured.location.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              />
              <SummaryField label="Customer segment" value={structured.customerSegment} full />
              <SummaryField label="Problem" value={structured.problem} full />
              <SummaryField label="Solution" value={structured.solution} full />
              <SummaryField label="Business model" value={structured.businessModel} />
              <SummaryField label="Pricing assumption" value={structured.pricingAssumption} />
              <SummaryField label="Revenue model" value={structured.revenueModel} />
            </div>
          </Card>
        )}

        <Card title={`Business assumptions (${assumptions.length})`} code="02">
          <div className="divide-y divide-border">
            {assumptions.map((a: BusinessAssumption) => (
              <div key={a.id} className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{a.category}</Badge>
                    <ImportanceBadge importance={a.importance} />
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {a.source === "ai_inferred" ? "AI-INFERRED" : "USER-PROVIDED"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{a.statement}</p>
                </div>
                <button
                  onClick={() => handleAssumptionRemove(a.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove assumption"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {assumptions.length === 0 && (
              <div className="px-6 py-4 text-sm text-muted-foreground">No assumptions.</div>
            )}
          </div>
        </Card>

        <Card title={`Hypotheses (${hypotheses.length})`} code="03">
          <div className="divide-y divide-border">
            {hypotheses.map((h: Hypothesis) => (
              <div key={h.id} className="space-y-3 px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{h.category.replace(/_/g, " ")}</Badge>
                      <select
                        value={h.importance}
                        onChange={(e) =>
                          handleHypothesisImportance(h.id, e.target.value as Importance)
                        }
                        className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <p className="mt-2 text-sm font-medium">{h.statement}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Validation criteria: {h.validationCriteria}
                    </p>
                    {h.threshold && (
                      <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500">
                        <span className="font-mono text-[9px] uppercase tracking-widest">
                          {h.thresholdType === "ai_proposed"
                            ? "AI-PROPOSED VALIDATION THRESHOLD"
                            : "Threshold"}
                        </span>
                        <span>{h.threshold}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleHypothesisDelete(h.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove hypothesis"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="ml-1 space-y-2 border-l border-border pl-4">
                  {(requirementsByHypothesis[h.id] ?? []).map((r: EvidenceRequirement) => (
                    <div key={r.id} className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            {r.evidenceType}
                          </span>
                          <select
                            value={r.minimumEvidenceLevel}
                            onChange={(e) =>
                              handleRequirementLevel(
                                h.id,
                                r.id,
                                e.target.value as MinimumEvidenceLevel,
                              )
                            }
                            className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                        <p className="mt-1 text-muted-foreground">{r.description}</p>
                        {r.preferredSources.length > 0 && (
                          <p className="mt-1 text-[10px] text-muted-foreground/70">
                            Sources: {r.preferredSources.join(", ")}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRequirementDelete(h.id, r.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Remove evidence requirement"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {(requirementsByHypothesis[h.id] ?? []).length === 0 && (
                    <div className="text-xs text-muted-foreground">No evidence requirements.</div>
                  )}
                </div>
              </div>
            ))}
            {hypotheses.length === 0 && (
              <div className="px-6 py-4 text-sm text-muted-foreground">No hypotheses.</div>
            )}
          </div>
        </Card>

        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {businessIdea.planStatus === "approved"
              ? "Plan approved"
              : "Approve to lock in this validation plan"}
          </div>
          <button
            onClick={onApprove}
            disabled={approving || businessIdea.planStatus === "approved"}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ boxShadow: "var(--glow-primary)" }}
          >
            {approving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Approve Validation Plan
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Card({
  title,
  code,
  children,
}: {
  title: string;
  code: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span className="font-mono text-[10px] text-muted-foreground">{code}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SummaryField({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1">{value || "—"}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

function ImportanceBadge({ importance }: { importance: Importance }) {
  const colors: Record<Importance, string> = {
    low: "border-border text-muted-foreground",
    medium: "border-blue-500/40 text-blue-500",
    high: "border-amber-500/40 text-amber-500",
    critical: "border-destructive/40 text-destructive",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${colors[importance]}`}
    >
      {importance}
    </span>
  );
}
