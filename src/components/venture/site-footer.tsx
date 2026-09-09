export function SiteFooter() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
        <div className="font-mono text-lg font-bold tracking-tighter">
          VENTURE<span className="text-primary">IQ</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            Status: All systems nominal
          </span>
          <a href="#" className="transition-colors hover:text-primary">Privacy</a>
          <a href="#" className="transition-colors hover:text-primary">Terms</a>
          <a href="#" className="transition-colors hover:text-primary">Docs</a>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          © 2026 VENTUREIQ Intelligence
        </div>
      </div>
    </footer>
  );
}