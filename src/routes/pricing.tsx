import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { SiteFooter } from "@/components/venture/site-footer";
import { SiteNav } from "@/components/venture/site-nav";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — VentureIQ" },
      {
        name: "description",
        content: "Free, Pro, and Enterprise plans. Priced per decision, not per seat.",
      },
      { property: "og:title", content: "Pricing — VentureIQ" },
      {
        property: "og:description",
        content: "Simple pricing for founders, teams, and institutions.",
      },
    ],
  }),
  component: Pricing,
});

const PLANS = [
  {
    name: "Free",
    price: "$0",
    tag: "Explore",
    features: [
      "2 projects",
      "5 research runs / month",
      "Full validation pipeline",
      "Print-friendly report",
    ],
  },
  {
    name: "Pro",
    price: "$29",
    tag: "For serious founders",
    featured: true,
    features: ["10 projects", "30 research runs / month", "Shareable reports", "Priority support"],
  },
  {
    name: "Enterprise",
    price: "Custom",
    tag: "Universities & accelerators",
    features: [
      "Unlimited projects & research",
      "Custom scoring weights",
      "Dedicated success manager",
    ],
  },
];

function Pricing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <section className="relative border-b border-border py-24">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
            // Pricing
          </span>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Priced per decision, not per seat.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Billing isn't live yet — every account currently runs on the Free tier during early
            access. Plans below show where usage limits are headed, not an active subscription.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-8 ${p.featured ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card"}`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-8 rounded-full border border-primary/40 bg-background px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-primary">
                  Most popular
                </span>
              )}
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {p.tag}
              </div>
              <div className="mt-2 text-xl font-semibold">{p.name}</div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight">{p.price}</span>
                {p.price !== "Custom" && (
                  <span className="text-sm text-muted-foreground">/ month</span>
                )}
              </div>
              <ul className="mt-8 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 flex-none text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={p.name === "Enterprise" ? "/auth" : "/projects/new"}
                className={`mt-8 flex justify-center rounded-md px-4 py-3 text-sm font-semibold transition ${p.featured ? "bg-primary text-primary-foreground hover:brightness-110" : "border border-border bg-background hover:bg-white/[0.05]"}`}
                style={p.featured ? { boxShadow: "var(--glow-primary)" } : undefined}
              >
                {p.name === "Enterprise" ? "Contact sales" : `Start with ${p.name}`}
              </Link>
            </div>
          ))}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
