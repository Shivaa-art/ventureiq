import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Compass,
  FileSearch,
  Loader2,
  Plus,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/venture/app-shell";
import { requireAuth } from "@/lib/auth/require-auth";
import { getDashboardData as getDashboardDataFn } from "@/backend/api/dashboard";
import { friendlyErrorMessage } from "@/lib/errors";
import type { DerivedProjectStatus } from "@/lib/types/domain";

const DERIVED_STATUS_LABELS: Record<DerivedProjectStatus, string> = {
  draft: "Draft",
  validation_plan: "Validation plan",
  researching: "Researching",
  review: "Review",
  ready_for_decision: "Ready for decision",
  completed: "Completed",
  failed: "Failed",
};

export const Route = createFileRoute("/dashboard")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "Dashboard — VentureIQ" },
      {
        name: "description",
        content: "Your business idea validations, opportunity scores, and evidence-backed reports.",
      },
      { property: "og:title", content: "Dashboard — VentureIQ" },
      { property: "og:description", content: "Your validated business opportunities at a glance." },
    ],
  }),
  component: Dashboard,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardDataFn>>;

function Dashboard() {
  const { user } = Route.useRouteContext();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardDataFn()
      .then(setData)
      .catch((err) => setError(friendlyErrorMessage(err)));
  }, []);

  if (error) {
    return (
      <AppShell title="Command center" breadcrumb="// Home / Dashboard" user={user}>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title="Command center" breadcrumb="// Home / Dashboard" user={user}>
        <div className="flex items-center justify-center px-6 py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (data.totalProjects === 0) {
    return (
      <AppShell title="Command center" breadcrumb="// Home / Dashboard" user={user}>
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary/[0.06]">
            <Compass className="size-6 text-primary" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Don't just analyze your idea.
            <br />
            Find out what must be true before you invest.
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            VentureIQ turns your business idea into testable hypotheses, gathers real evidence for
            and against each one, and tells you exactly what to validate next — before you spend a
            rupee.
          </p>
          <div className="mx-auto mt-10 max-w-md space-y-4 text-left">
            <OnboardingStep n={1} text="Describe your business idea." />
            <OnboardingStep
              n={2}
              text="VentureIQ identifies what must be true, and researches evidence."
            />
            <OnboardingStep n={3} text="VentureIQ shows you what to validate next." />
          </div>
          <Link
            to="/projects/new"
            className="mt-10 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110"
            style={{ boxShadow: "var(--glow-primary)" }}
          >
            <Sparkles className="size-4" />
            Start your first project
          </Link>
        </div>
      </AppShell>
    );
  }

  const stats = [
    { label: "Total projects", value: data.totalProjects },
    { label: "Active projects", value: data.activeProjects },
    { label: "Completed analyses", value: data.completedAnalyses },
    {
      label: "Avg. opportunity",
      value: data.averageOpportunityScore != null ? Math.round(data.averageOpportunityScore) : "—",
      suffix: data.averageOpportunityScore != null ? "/100" : undefined,
    },
    {
      label: "Avg. confidence",
      value: data.averageConfidence != null ? Math.round(data.averageConfidence) : "—",
      suffix: data.averageConfidence != null ? "%" : undefined,
    },
  ];

  return (
    <AppShell title="Command center" breadcrumb="// Home / Dashboard" user={user}>
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-mono text-3xl font-bold tabular-nums">{s.value}</span>
                {s.suffix && <span className="text-sm text-muted-foreground">{s.suffix}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            to="/projects/new"
            className="group relative overflow-hidden rounded-xl border border-primary/30 bg-primary/[0.06] p-6 transition hover:bg-primary/[0.1]"
          >
            <div className="absolute inset-0 grid-bg opacity-30" />
            <div className="relative">
              <Sparkles className="size-6 text-primary" />
              <div className="mt-6 text-lg font-semibold">Validate a new idea</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Structured hypotheses, real evidence, a clear next step.
              </div>
              <div className="mt-6 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-primary">
                Start <ArrowUpRight className="size-3" />
              </div>
            </div>
          </Link>
          <Link
            to="/pricing"
            className="rounded-xl border border-border bg-card p-6 transition hover:bg-white/[0.02]"
          >
            <TrendingUp className="size-6 text-chart-3" />
            <div className="mt-6 text-lg font-semibold">Plans &amp; usage</div>
            <div className="mt-1 text-sm text-muted-foreground">
              See your plan and what's included.
            </div>
            <div className="mt-6 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-chart-3">
              View plans <ArrowUpRight className="size-3" />
            </div>
          </Link>
        </div>

        <div id="projects" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                // projects
              </div>
              <div className="text-base font-semibold">Recent validations</div>
            </div>
            <Link
              to="/projects/new"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold transition hover:bg-white/[0.05]"
            >
              <Plus className="size-3.5" /> New
            </Link>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Industry</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Opportunity</th>
                <th className="px-6 py-3 text-left">Confidence</th>
                <th className="px-6 py-3 text-left">Coverage</th>
                <th className="px-6 py-3 text-left">Updated</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.recentProjects.map((p) => (
                <tr
                  key={p.projectId}
                  className="border-b border-border transition last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-6 py-4 font-medium">{p.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{p.industry ?? "—"}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-6 py-4 font-mono text-lg font-bold tabular-nums">
                    {p.opportunityScore != null ? Math.round(p.opportunityScore) : "—"}
                  </td>
                  <td className="px-6 py-4 font-mono text-sm tabular-nums text-muted-foreground">
                    {p.overallConfidence != null ? `${Math.round(p.overallConfidence)}%` : "—"}
                  </td>
                  <td className="px-6 py-4 font-mono text-sm tabular-nums text-muted-foreground">
                    {p.evidenceCoveragePct != null ? `${Math.round(p.evidenceCoveragePct)}%` : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <a
                      href={`/report/${p.businessIdeaId}`}
                      className="font-mono text-[10px] uppercase tracking-widest text-primary hover:underline"
                    >
                      Open →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function OnboardingStep({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex size-6 flex-none items-center justify-center rounded-full border border-primary/40 font-mono text-xs font-bold text-primary">
        {n}
      </span>
      <span className="text-sm">{text}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: DerivedProjectStatus }) {
  const colors: Record<DerivedProjectStatus, string> = {
    draft: "border-border text-muted-foreground",
    validation_plan: "border-blue-500/40 text-blue-500",
    researching: "border-amber-500/40 text-amber-500",
    review: "border-amber-500/40 text-amber-500",
    ready_for_decision: "border-primary/40 text-primary",
    completed: "border-primary/40 text-primary",
    failed: "border-destructive/40 text-destructive",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${colors[status]}`}
    >
      {DERIVED_STATUS_LABELS[status]}
    </span>
  );
}
