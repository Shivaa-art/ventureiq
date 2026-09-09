import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Cpu,
  FileText,
  Radar,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { SiteNav } from "@/components/venture/site-nav";
import { SiteFooter } from "@/components/venture/site-footer";
import { ScoreDial } from "@/components/venture/score-dial";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <div className="relative mx-auto max-w-7xl px-6 pb-32 pt-24">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-primary">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Evidence-driven validation
              </div>
              <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
                Validate <span className="italic text-muted-foreground">before</span> you invest.
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
                Don't just analyze your idea. VentureIQ turns it into testable hypotheses, gathers
                real evidence for and against each one, and shows you exactly what to validate next.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/projects/new"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
                  style={{ boxShadow: "var(--glow-primary)" }}
                >
                  Start Free Validation
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>

            {/* Score preview */}
            <div className="relative">
              <div
                className="relative z-10 rounded-2xl border border-border bg-card p-8"
                style={{ boxShadow: "0 30px 80px -20px oklch(0 0 0 / 0.6)" }}
              >
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Illustrative example
                    </div>
                    <div className="mt-1 text-sm text-foreground/80">Opportunity Report</div>
                  </div>
                  <span className="font-mono text-[10px] tracking-widest text-primary">
                    CONFIDENCE: 74%
                  </span>
                </div>
                <div className="grid gap-8 md:grid-cols-2 md:items-center">
                  <ScoreDial value={68} size={200} stroke={10} />
                  <div className="space-y-5">
                    {[
                      ["Market Demand", 72, "primary"],
                      ["Customer Pain", 65, "accent"],
                      ["Scalability", 58, "primary"],
                      ["Evidence Coverage", 61, "chart-4"],
                    ].map(([label, val, tone]) => (
                      <div key={label as string} className="space-y-1.5">
                        <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          <span>{label}</span>
                          <span className="text-foreground">{val}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${val}%`,
                              background: `var(--color-${tone})`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-8 flex items-center justify-between border-t border-border pt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>Evidence-backed</span>
                  <span>Illustrative example</span>
                </div>
              </div>
              <div className="absolute -inset-4 -z-0 rounded-3xl border border-primary/10" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="platform" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 flex flex-col gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
            Platform
          </span>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
            Idea → hypotheses → evidence → confidence → validation.
          </h2>
        </div>
        <div className="grid gap-px border border-border bg-border md:grid-cols-3">
          {[
            {
              icon: Sparkles,
              title: "Idea structuring",
              body: "Your business idea is parsed into a structured model — customer, problem, solution, business model — before anything else runs.",
            },
            {
              icon: Radar,
              title: "Testable hypotheses",
              body: "VentureIQ identifies the specific, falsifiable claims your idea depends on, and what evidence would confirm or contradict each one.",
            },
            {
              icon: BarChart3,
              title: "Evidence collection",
              body: "Add evidence yourself, run demo data to explore the workflow, or let VentureIQ search the web for sources — every item keeps its original source and date.",
            },
            {
              icon: ShieldCheck,
              title: "Conflict & gap detection",
              body: "Contradicting evidence is surfaced, not averaged away. Missing evidence is flagged as a gap, never treated as a bad sign by itself.",
            },
            {
              icon: Cpu,
              title: "Deterministic confidence",
              body: "Confidence and opportunity scores are calculated by transparent formulas from your actual evidence — never asserted directly by an AI model.",
            },
            {
              icon: FileText,
              title: "What to validate next",
              body: "A ranked recommendation for your next validation step, with the reasoning, expected value, and rough cost/time attached.",
            },
          ].map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="group bg-background p-8 transition-colors hover:bg-card">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded border border-border text-primary">
                  <Icon className="size-4" />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="protocol" className="border-t border-border py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-16 md:grid-cols-3">
            <div className="md:sticky md:top-24 md:self-start">
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                Protocol
              </span>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Validation sequence</h2>
              <p className="mt-4 text-muted-foreground">
                The actual pipeline VentureIQ runs on every idea. Every score traces back to real
                evidence.
              </p>
            </div>
            <div className="md:col-span-2 md:space-y-16">
              {[
                {
                  n: "01",
                  title: "Idea → Hypotheses",
                  body: "You describe the idea. VentureIQ structures it and identifies the testable claims it depends on.",
                },
                {
                  n: "02",
                  title: "Hypotheses → Evidence",
                  body: "For each hypothesis, evidence requirements are generated and evidence is collected — by you, from demo data, or from real web research you review and approve.",
                },
                {
                  n: "03",
                  title: "Evidence → Confidence",
                  body: "Confidence and opportunity scores are calculated by a documented, deterministic formula — not asserted by an AI model.",
                },
                {
                  n: "04",
                  title: "Confidence → Validation",
                  body: "You get a ranked next validation action, the reasoning behind it, and a decision-support report you can act on.",
                },
              ].map(({ n, title, body }) => (
                <div
                  key={n}
                  className="flex gap-8 border-b border-border pb-8 last:border-0 last:pb-0 md:border-0 md:pb-0"
                >
                  <div className="flex-none font-mono text-3xl text-border">{n}</div>
                  <div>
                    <h4 className="text-xl font-medium">{title}</h4>
                    <p className="mt-2 text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 flex flex-col gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
              Pricing
            </span>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Priced per decision, not per seat.
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Billing isn't live yet — every account currently runs on the Free tier while VentureIQ
              is in early access. Plans below show where usage limits are headed.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Free",
                price: "$0",
                tag: "2 projects",
                features: [
                  "Full validation pipeline",
                  "5 research runs / month",
                  "Print-friendly report",
                ],
              },
              {
                name: "Pro",
                price: "$29",
                tag: "10 projects",
                features: ["30 research runs / month", "Shareable reports", "Priority support"],
                featured: true,
              },
              {
                name: "Enterprise",
                price: "Custom",
                tag: "For orgs & universities",
                features: [
                  "Unlimited projects & research",
                  "Custom scoring weights",
                  "Dedicated success manager",
                ],
              },
            ].map((p) => (
              <div
                key={p.name}
                className={`relative rounded-xl border p-8 ${p.featured ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-card"}`}
              >
                {p.featured && (
                  <span className="absolute -top-2 right-6 rounded-full border border-primary/40 bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                    Recommended
                  </span>
                )}
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {p.name}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                  {p.price !== "Custom" && (
                    <span className="text-sm text-muted-foreground">/ mo</span>
                  )}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{p.tag}</div>
                <ul className="mt-6 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Zap className="size-3.5 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/projects/new"
                  className={`mt-8 flex justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                    p.featured
                      ? "bg-primary text-primary-foreground hover:brightness-110"
                      : "border border-border bg-background hover:bg-white/[0.05]"
                  }`}
                >
                  Start with {p.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-border py-24">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Stop guessing. <span className="text-primary">Start deciding.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Your first validation is on us. No card, no waitlist.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              to="/projects/new"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground"
              style={{ boxShadow: "var(--glow-primary)" }}
            >
              Analyze my idea
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
