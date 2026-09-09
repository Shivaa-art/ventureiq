import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/venture/app-shell";
import { requireAuth } from "@/lib/auth/require-auth";
import { getUsageSnapshot } from "@/backend/api/dashboard";

export const Route = createFileRoute("/settings")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "Settings — VentureIQ" },
      {
        name: "description",
        content: "Manage your VentureIQ workspace, profile, and notifications.",
      },
      { property: "og:title", content: "Settings — VentureIQ" },
      { property: "og:description", content: "Configure your workspace." },
    ],
  }),
  component: Settings,
});

type UsageSnapshot = Awaited<ReturnType<typeof getUsageSnapshot>>;

function Settings() {
  const { user } = Route.useRouteContext();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const createdAt = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  useEffect(() => {
    getUsageSnapshot().then(setUsage);
  }, []);

  return (
    <AppShell title="Settings" breadcrumb="// Home / Settings" user={user}>
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <Card title="Profile" code="01">
          <Row label="Email" value={user.email} />
          <Row label="User ID" value={user.id} mono />
          <Row label="Member since" value={createdAt} />
        </Card>
        <Card title="Plan & usage" code="02">
          {usage ? (
            <>
              <Row label="Current plan" value={usage.plan} />
              <Row
                label="Projects"
                value={
                  usage.limits.projects != null
                    ? `${usage.current.projects} / ${usage.limits.projects}`
                    : `${usage.current.projects} (unlimited)`
                }
              />
              <Row
                label="Research runs this month"
                value={
                  usage.limits.researchRunsPerMonth != null
                    ? `${usage.current.researchRuns} / ${usage.limits.researchRunsPerMonth}`
                    : `${usage.current.researchRuns} (unlimited)`
                }
              />
              <Row
                label="Research sources retrieved"
                value={String(usage.current.researchSources)}
              />
              <Row
                label="Validation actions recorded"
                value={String(usage.current.validationActionsRecorded)}
              />
            </>
          ) : (
            <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading usage…
            </div>
          )}
        </Card>
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
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className={mono ? "font-mono text-xs text-muted-foreground" : "text-sm"}>{value}</span>
    </div>
  );
}
