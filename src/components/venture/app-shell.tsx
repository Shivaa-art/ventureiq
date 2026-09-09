import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
  User2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { signOut } from "@/backend/auth/session";
import type { AuthUser } from "@/lib/types/auth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects/new", label: "New analysis", icon: Sparkles },
  { to: "/dashboard", label: "Projects", icon: FolderKanban, hash: "projects" },
  { to: "/pricing", label: "Pricing", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  children,
  title,
  breadcrumb,
  user,
}: {
  children: ReactNode;
  title?: string;
  breadcrumb?: string;
  user?: AuthUser;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      navigate({ href: "/" });
    }
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link to="/" className="font-mono text-lg font-bold tracking-tighter">
            VENTURE<span className="text-primary">IQ</span>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-primary">
              Free plan
            </div>
            <div className="mt-1 text-xs text-muted-foreground">1 of 2 reports used</div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
              <div className="h-full w-1/2 bg-primary" />
            </div>
            <Link
              to="/pricing"
              className="mt-3 flex justify-center rounded bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Upgrade
            </Link>
          </div>
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <div className="flex size-8 items-center justify-center rounded-full border border-border bg-background">
              <User2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {user?.email ? user.email.split("@")[0] : "Founder"}
              </div>
              <div className="truncate text-xs text-muted-foreground">{user?.email ?? "—"}</div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              title="Sign out"
              className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between px-6">
            <div>
              {breadcrumb && (
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {breadcrumb}
                </div>
              )}
              <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground md:flex">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Live · v4.2
              </div>
              <Link
                to="/projects/new"
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
              >
                + New analysis
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
