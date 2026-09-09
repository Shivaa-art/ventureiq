import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Printer, Share2, X } from "lucide-react";
import { AppShell } from "@/components/venture/app-shell";
import { requireAuth } from "@/lib/auth/require-auth";
import { friendlyErrorMessage } from "@/lib/errors";
import {
  createShareLink,
  disableShareLink,
  getProjectReport,
  getSharedReport,
} from "@/backend/api/report";
import type { DerivedProjectStatus } from "@/lib/types/domain";

type ReportData = Awaited<ReturnType<typeof getProjectReport>>;

const STATUS_LABELS: Record<DerivedProjectStatus, string> = {
  draft: "Draft",
  validation_plan: "Validation plan",
  researching: "Researching",
  review: "Review",
  ready_for_decision: "Ready for decision",
  completed: "Completed",
  failed: "Failed",
};

export const Route = createFileRoute("/report/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    share: typeof search.share === "string" ? search.share : undefined,
  }),
  beforeLoad: async ({ search, location }) => {
    if (search.share) return {};
    return requireAuth({ location });
  },
  head: () => ({
    meta: [
      { title: "Report — VentureIQ" },
      { name: "description", content: "Evidence-driven business validation report." },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = useParams({ from: "/report/$id" });
  const { share } = Route.useSearch();
  const context = Route.useRouteContext() as { user?: import("@/lib/types/auth").AuthUser };
  const user = context.user;

  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = share
      ? getSharedReport({ data: { token: share } })
      : getProjectReport({ data: { businessIdeaId: id } });
    load
      .then((r) => {
        if (!r) {
          setError("This report is not available or the share link has been disabled.");
        } else {
          setReport(r);
        }
      })
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, [id, share]);

  async function handleCreateShareLink() {
    setShareBusy(true);
    try {
      const updated = await createShareLink({ data: { businessIdeaId: id } });
      setReport((prev) => (prev ? { ...prev, businessIdea: updated } : prev));
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setShareBusy(false);
    }
  }

  async function handleDisableShareLink() {
    setShareBusy(true);
    try {
      const updated = await disableShareLink({ data: { businessIdeaId: id } });
      setReport((prev) => (prev ? { ...prev, businessIdea: updated } : prev));
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setShareBusy(false);
    }
  }

  function copyShareUrl() {
    if (!report?.businessIdea.shareToken) return;
    const url = `${window.location.origin}/report/${id}?share=${report.businessIdea.shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const content = error ? (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <AlertTriangle className="mx-auto size-8 text-destructive" />
      <p className="mt-4 text-sm text-destructive">{error}</p>
    </div>
  ) : !report ? (
    <div className="flex items-center justify-center px-6 py-24">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <ReportBody
      report={report}
      isSharedView={!!share}
      shareBusy={shareBusy}
      copied={copied}
      onCreateShare={handleCreateShareLink}
      onDisableShare={handleDisableShareLink}
      onCopyShare={copyShareUrl}
    />
  );

  if (share) {
    // Public shared view: no authenticated app shell/nav — a minimal,
    // read-only page anyone with the link can open.
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border px-6 py-4">
          <span className="font-mono text-lg font-bold tracking-tighter">
            VENTURE<span className="text-primary">IQ</span>
          </span>
          <span className="ml-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Shared report · read-only
          </span>
        </header>
        {content}
      </div>
    );
  }

  return (
    <AppShell title="Report" breadcrumb={`// Reports / ${id}`} user={user}>
      {content}
    </AppShell>
  );
}

function ReportBody({
  report,
  isSharedView,
  shareBusy,
  copied,
  onCreateShare,
  onDisableShare,
  onCopyShare,
}: {
  report: ReportData;
  isSharedView: boolean;
  shareBusy: boolean;
  copied: boolean;
  onCreateShare: () => void;
  onDisableShare: () => void;
  onCopyShare: () => void;
}) {
  if (!report) return null;
  const {
    businessIdea,
    hypotheses,
    evidenceByHypothesis,
    coverageByHypothesis,
    conflicts,
    gaps,
    opportunityScore,
    projectConfidence,
    criticalUncertainties,
    validationActions,
    scoreHistory,
    researchRunsCount,
    researchSourcesCount,
    decision,
    derivedStatus,
  } = report;
  const structured = businessIdea.structured;
  const topAction = validationActions.find((a) => a.status === "recommended");
  const openConflicts = conflicts.filter((c) => c.status === "open");
  const openGaps = gaps.filter((g) => g.status === "open");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8 print:max-w-full print:px-2">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <span className="rounded border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {STATUS_LABELS[derivedStatus]}
          </span>
        </div>
        {!isSharedView && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            >
              <Printer className="size-4" />
              Print / Export
            </button>
            {businessIdea.shareEnabled ? (
              <>
                <button
                  onClick={onCopyShare}
                  className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied!" : "Copy share link"}
                </button>
                <button
                  onClick={onDisableShare}
                  disabled={shareBusy}
                  className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <X className="size-4" />
                  Disable link
                </button>
              </>
            ) : (
              <button
                onClick={onCreateShare}
                disabled={shareBusy}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50"
              >
                {shareBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Share2 className="size-4" />
                )}
                Create share link
              </button>
            )}
          </div>
        )}
      </div>

      {/* EXECUTIVE SUMMARY */}
      <Section title="Executive summary" code="01">
        <div className="grid gap-4 p-6 text-sm md:grid-cols-2">
          <Field label="Business" value={businessIdea.raw.businessName} full />
          <Field
            label="Industry"
            value={structured?.industry ?? businessIdea.raw.industry ?? "—"}
          />
          <Field
            label="Location"
            value={
              structured
                ? [structured.location.city, structured.location.state, structured.location.country]
                    .filter(Boolean)
                    .join(", ")
                : [businessIdea.raw.city, businessIdea.raw.state, businessIdea.raw.country]
                    .filter(Boolean)
                    .join(", ") || "—"
            }
          />
          <Field
            label="Target customer"
            value={structured?.customerSegment ?? businessIdea.raw.targetCustomer ?? "—"}
            full
          />
          <Field
            label="Customer problem"
            value={structured?.problem ?? businessIdea.raw.problem ?? "—"}
            full
          />
          <Field
            label="Proposed solution"
            value={structured?.solution ?? businessIdea.raw.solution ?? "—"}
            full
          />
          <Field
            label="Business model"
            value={structured?.businessModel ?? businessIdea.raw.businessModel ?? "—"}
          />
          <Field
            label="Revenue model"
            value={structured?.revenueModel ?? businessIdea.raw.revenueModel ?? "—"}
          />
        </div>
      </Section>

      {/* OPPORTUNITY OVERVIEW */}
      <Section title="Opportunity overview" code="02">
        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
          <MetricCard
            label="Opportunity score"
            value={opportunityScore ? Math.round(opportunityScore.overallScore) : null}
            insufficientLabel="Insufficient evidence"
          />
          <MetricCard
            label="Overall confidence"
            value={projectConfidence ? Math.round(projectConfidence.overallConfidence) : null}
            suffix="%"
            insufficientLabel="Insufficient evidence"
          />
          <MetricCard
            label="Evidence coverage"
            value={projectConfidence ? Math.round(projectConfidence.evidenceCoveragePct) : null}
            suffix="%"
            insufficientLabel="Insufficient evidence"
          />
        </div>
        {scoreHistory.length > 1 && (
          <div className="border-t border-border px-6 py-4">
            <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Score history ({scoreHistory.length} recalculation
              {scoreHistory.length === 1 ? "" : "s"})
            </div>
            <div className="mt-2 space-y-1 text-xs">
              {scoreHistory.map((pt, i) => (
                <div
                  key={pt.calculatedAt}
                  className="flex items-center gap-3 text-muted-foreground"
                >
                  <span className="font-mono text-[9px]">
                    {i === 0 ? "Initial" : `#${i + 1}`} ·{" "}
                    {new Date(pt.calculatedAt).toLocaleString()}
                  </span>
                  <span>
                    Opportunity{" "}
                    {pt.opportunityScore != null ? Math.round(pt.opportunityScore) : "—"} ·
                    Confidence{" "}
                    {pt.overallConfidence != null ? Math.round(pt.overallConfidence) : "—"}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* HYPOTHESES */}
      <Section title={`Hypotheses (${hypotheses.length})`} code="03">
        <div className="divide-y divide-border">
          {hypotheses.map((h) => {
            const conf = report.confidenceScores.find((c) => c.hypothesisId === h.id);
            const coverage = coverageByHypothesis[h.id];
            return (
              <div key={h.id} className="px-6 py-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{h.statement}</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    {h.importance}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>
                    Confidence:{" "}
                    {conf ? `${Math.round(conf.finalConfidence)}%` : "Insufficient evidence"}
                  </span>
                  <span>Coverage: {coverage ? `${Math.round(coverage.coveragePct)}%` : "—"}</span>
                  <span>Status: {h.status.replace(/_/g, " ")}</span>
                </div>
              </div>
            );
          })}
          {hypotheses.length === 0 && (
            <div className="px-6 py-4 text-sm text-muted-foreground">
              Your validation plan has not been generated yet.
            </div>
          )}
        </div>
      </Section>

      {/* EVIDENCE */}
      <Section title="Evidence" code="04">
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <SummaryStat
            label="Supporting"
            value={
              Object.values(evidenceByHypothesis)
                .flat()
                .filter((e) => e.supportDirection === "supports" && e.reviewStatus === "accepted")
                .length
            }
          />
          <SummaryStat
            label="Contradicting"
            value={
              Object.values(evidenceByHypothesis)
                .flat()
                .filter(
                  (e) => e.supportDirection === "contradicts" && e.reviewStatus === "accepted",
                ).length
            }
          />
          <SummaryStat
            label="Open gaps"
            value={openGaps.length}
            emptyLabel="No evidence gaps detected."
          />
          <SummaryStat
            label="Open conflicts"
            value={openConflicts.length}
            emptyLabel="No evidence conflicts detected."
          />
        </div>
      </Section>

      {/* RESEARCH */}
      <Section title="Research" code="05">
        <div className="grid gap-4 p-6 sm:grid-cols-2 text-sm">
          <SummaryStat
            label="Research runs conducted"
            value={researchRunsCount}
            emptyLabel="This project has not been researched yet."
          />
          <SummaryStat label="Sources retrieved" value={researchSourcesCount} />
        </div>
      </Section>

      {/* CRITICAL UNCERTAINTIES */}
      <Section title="Critical uncertainties" code="06">
        <div className="space-y-2 p-6">
          {criticalUncertainties.slice(0, 5).map((u) => (
            <div key={u.hypothesisId} className="rounded-md border border-border p-3 text-sm">
              <div className="font-medium">{u.statement}</div>
              <div className="mt-1 text-xs text-muted-foreground">{u.reason}</div>
            </div>
          ))}
          {criticalUncertainties.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No critical uncertainties identified from the current evidence.
            </div>
          )}
        </div>
      </Section>

      {/* RECOMMENDED NEXT VALIDATION */}
      <Section title="Recommended next validation" code="07">
        {topAction ? (
          <div className="p-6 text-sm">
            <div className="font-semibold">{topAction.actionTitle}</div>
            <p className="mt-1 text-muted-foreground">{topAction.actionDescription}</p>
            <p className="mt-2 text-xs text-muted-foreground">{topAction.reasoning}</p>
            <div className="mt-3 flex flex-wrap gap-4 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              <span>Expected value: {Math.round(topAction.expectedInformationValue)}</span>
              {topAction.estimatedCost && <span>Cost: {topAction.estimatedCost}</span>}
              {topAction.estimatedTime && <span>Time: {topAction.estimatedTime}</span>}
            </div>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">
            No open validation actions right now.
          </div>
        )}
      </Section>

      {/* DECISION */}
      <Section title="Decision" code="08">
        <div className="p-6 text-sm">
          {topAction && (
            <div className="mb-3 text-xs text-muted-foreground">
              VentureIQ assessment:{" "}
              <span className="font-semibold text-foreground">Validate further</span> (see
              recommended action above)
            </div>
          )}
          {decision ? (
            <>
              <div className="text-xs text-muted-foreground">User decision:</div>
              <div className="mt-1 text-lg font-semibold">
                {decision.decision.replace(/_/g, " ")}
              </div>
              {decision.decisionBasis && (
                <p className="mt-2 text-muted-foreground">{decision.decisionBasis}</p>
              )}
              {decision.notes && (
                <p className="mt-1 text-xs text-muted-foreground">{decision.notes}</p>
              )}
            </>
          ) : (
            <div className="text-muted-foreground">No decision has been recorded yet.</div>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  code,
  children,
}: {
  title: string;
  code: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card print:break-inside-avoid">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span className="font-mono text-[10px] text-muted-foreground">{code}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1">{value || "—"}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  insufficientLabel,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  insufficientLabel: string;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {value != null ? (
        <div className="mt-1 text-3xl font-bold tabular-nums">
          {value}
          {suffix && <span className="text-base text-muted-foreground">{suffix}</span>}
        </div>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">{insufficientLabel}</div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  emptyLabel,
}: {
  label: string;
  value: number;
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {value === 0 && emptyLabel ? (
        <div className="mt-1 text-xs text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      )}
    </div>
  );
}
