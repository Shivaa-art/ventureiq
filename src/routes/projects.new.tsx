import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/venture/app-shell";
import { requireAuth } from "@/lib/auth/require-auth";
import { createProject } from "@/backend/api/projects";
import type { RawBusinessIdeaInput } from "@/lib/types/domain";

export const Route = createFileRoute("/projects/new")({
  beforeLoad: requireAuth,
  head: () => ({
    meta: [
      { title: "New validation — VentureIQ" },
      {
        name: "description",
        content:
          "Describe your business idea. VentureIQ scores demand, competition, risk, and unit economics.",
      },
      { property: "og:title", content: "New validation — VentureIQ" },
      { property: "og:description", content: "Kick off a new AI-powered business validation." },
    ],
  }),
  component: NewProject,
});

const MODELS = ["B2B", "B2C", "Marketplace", "SaaS", "Subscription", "Manufacturing", "Other"];
const INDUSTRIES = [
  "Fintech",
  "Healthcare",
  "Logistics",
  "Clean Energy",
  "EdTech",
  "Retail / D2C",
  "AI / Software",
  "Real Estate",
  "Media",
  "Manufacturing",
  "Agriculture",
  "Food & Beverage",
  "Other",
];

const EMPTY_FORM: RawBusinessIdeaInput = {
  businessName: "",
  description: "",
  industry: "",
  country: "",
  state: "",
  city: "",
  targetCustomer: "",
  problem: "",
  solution: "",
  businessModel: "",
  expectedPricing: "",
  estimatedInvestment: "",
  revenueModel: "",
};

function NewProject() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [form, setForm] = useState<RawBusinessIdeaInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof RawBusinessIdeaInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.businessName.trim() || form.description.trim().length < 20) {
      setError("Business name is required, and the description needs at least 20 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createProject({ data: form });
      navigate({ href: `/analysis/${result.businessIdeaId}` });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the project. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="New validation" breadcrumb="// Home / Projects / New" user={user}>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
          <Sparkles className="size-5 flex-none text-primary" />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-primary">
              // briefing
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              The more specific your inputs, the sharper the validation plan. Anything left blank is
              inferred by the model — and clearly labeled as such before you approve it.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 flex-none" />
            <span>{error}</span>
          </div>
        )}

        <form className="space-y-8" onSubmit={handleSubmit}>
          <Section title="Business" code="01">
            <Field
              label="Business name"
              placeholder="SolarLogistics"
              value={form.businessName}
              onChange={(v) => setField("businessName", v)}
              required
            />
            <Field
              label="Industry"
              as="select"
              options={INDUSTRIES}
              value={form.industry ?? ""}
              onChange={(v) => setField("industry", v)}
            />
            <Field
              label="Country"
              placeholder="India"
              value={form.country ?? ""}
              onChange={(v) => setField("country", v)}
            />
            <div className="grid grid-cols-2 gap-5">
              <Field
                label="State"
                placeholder="Telangana"
                value={form.state ?? ""}
                onChange={(v) => setField("state", v)}
              />
              <Field
                label="City"
                placeholder="Hyderabad"
                value={form.city ?? ""}
                onChange={(v) => setField("city", v)}
              />
            </div>
          </Section>

          <Section title="The idea" code="02">
            <Field
              label="Business description"
              placeholder="One paragraph. What is it, who is it for, what does it do?"
              as="textarea"
              full
              value={form.description}
              onChange={(v) => setField("description", v)}
              required
            />
            <Field
              label="Target customer"
              placeholder="BBA students preparing for semester exams"
              value={form.targetCustomer ?? ""}
              onChange={(v) => setField("targetCustomer", v)}
            />
            <Field
              label="Customer problem"
              placeholder="What problem does this solve today?"
              value={form.problem ?? ""}
              onChange={(v) => setField("problem", v)}
            />
            <Field
              label="Proposed solution"
              placeholder="Why you, why now?"
              as="textarea"
              full
              value={form.solution ?? ""}
              onChange={(v) => setField("solution", v)}
            />
          </Section>

          <Section title="Economics" code="03">
            <Field
              label="Expected pricing"
              placeholder="₹499/month"
              value={form.expectedPricing ?? ""}
              onChange={(v) => setField("expectedPricing", v)}
            />
            <Field
              label="Estimated investment"
              placeholder="₹5,00,000"
              value={form.estimatedInvestment ?? ""}
              onChange={(v) => setField("estimatedInvestment", v)}
            />
            <Field
              label="Revenue model"
              placeholder="Monthly subscription"
              value={form.revenueModel ?? ""}
              onChange={(v) => setField("revenueModel", v)}
            />
            <div className="md:col-span-2">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Business model
              </div>
              <div className="flex flex-wrap gap-2">
                {MODELS.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setField("businessModel", m)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${form.businessModel === m ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Structures your idea, extracts assumptions, generates hypotheses & evidence
              requirements
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ boxShadow: "var(--glow-primary)" }}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Run validation
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
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
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <span className="font-mono text-[10px] text-muted-foreground">{code}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="grid gap-5 p-6 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  placeholder,
  as = "input",
  full,
  options,
  value,
  onChange,
  required,
}: {
  label: string;
  placeholder?: string;
  as?: "input" | "textarea" | "select";
  full?: boolean;
  options?: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const base =
    "w-full rounded-md border border-border bg-input px-4 py-3 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20";
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
        {required && <span className="text-primary"> *</span>}
      </span>
      {as === "textarea" ? (
        <textarea
          className={`${base} min-h-24 resize-y`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : as === "select" ? (
        <select className={base} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>
            Select…
          </option>
          {options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={base}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
