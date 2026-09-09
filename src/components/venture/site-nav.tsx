import { Link } from "@tanstack/react-router";

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-10">
          <Link to="/" className="font-mono text-xl font-bold tracking-tighter">
            VENTURE<span className="text-primary">IQ</span>
          </Link>
          <div className="hidden gap-7 md:flex">
            <a
              href="/#platform"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Platform
            </a>
            <a
              href="/#protocol"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Protocol
            </a>
            <Link
              to="/pricing"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              to="/dashboard"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            search={{ redirect: undefined }}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            to="/projects/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
            style={{ boxShadow: "var(--glow-primary)" }}
          >
            Analyze Idea
          </Link>
        </div>
      </div>
    </nav>
  );
}
