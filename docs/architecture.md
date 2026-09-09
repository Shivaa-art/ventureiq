# VentureIQ — Architecture

_Last updated: Phase 3 (Idea Structuring → Assumptions → Hypotheses → Evidence Requirements)_

## System overview

VentureIQ is an evidence-driven business validation pipeline, not a
single-prompt "idea → report" generator. As of Phase 4, the implemented
pipeline is:

```
Raw Business Idea (founder form input)
  │
  ▼
Idea Structuring Engine        (ideaParser)
  │  → StructuredBusinessIdea, Zod-validated
  ▼
Assumption Extraction          (assumptionExtractor)
  │  → BusinessAssumption[], each source-tagged ai_inferred
  ▼
Hypothesis Generation          (hypothesisGenerator)
  │  → Hypothesis[], category-constrained, thresholds labeled
  ▼
Evidence Requirement Generation (evidenceRequirementGenerator)
  │  → EvidenceRequirement[], generated per hypothesis, domain-adapted
  ▼
Human Review & Edit             (Step 8 — analysis.$id.tsx review screen)
  │  → founder can edit importance/threshold/evidence level, delete items
  ▼
Approve Validation Plan
  │  → business_ideas.plan_status = 'approved'
  ▼
Evidence Collection             (DemoEvidenceProvider / UserEvidenceProvider)
  │  → RawEvidenceContent, provider-agnostic
  ▼
Evidence Classification         (evidenceClassifier, or founder's own label)
  │  → SUPPORTS / CONTRADICTS / NEUTRAL + reason + confidence
  ▼
Evidence Normalization          (deterministic quality scores)
  │  → Evidence rows + evidence_relationships rows
  ▼
Gap Detection + Conflict Detection  (deterministic, per hypothesis)
  │  → EvidenceGap[] / EvidenceConflict[], re-run on every evidence change
  ▼
Confidence Engine                (deterministic, per hypothesis + project-level)
  │  → ConfidenceScore, confidence_level, supporting/contradicting factor summaries
  ▼
Opportunity Score                (deterministic aggregation of dimension mappings)
  │  → RAW_SCORE and CONFIDENCE_ADJUSTED_SCORE, per-dimension traceability
  ▼
Critical Uncertainty + Adaptive Validation Action (deterministic ranking)
  │  → next recommended validation, linked to the specific gap/hypothesis
  ▼
Human Decision
  → PROCEED / VALIDATE_FURTHER / MODIFY_IDEA / REJECT, founder-initiated only
```

Recording a validation result closes the loop: it creates new
evidence, which re-triggers the evidence layer's coverage/gap/conflict
recalculation (Phase 4, unmodified), which re-triggers confidence,
opportunity, and validation-action recalculation (Phase 5) — see
`docs/validation-engine.md`, "The adaptive loop."

As of Phase 6, evidence can also arrive from real external research
rather than only founder submission or demo data:

```
Hypothesis + Evidence Requirements
  ▼
Research Planning (LLM: research question + search queries)
  ▼
Web Search + Grounded Extraction (LLM + Anthropic web_search tool)
  ▼
Source Quality Scoring (deterministic authority-tier categorization)
  ▼
Evidence created with reviewStatus "pending_review"
  ▼
Human Review (accept / reject) — only acceptance re-enters the
  existing Phase 4/5 pipeline above
```

See `docs/research-engine.md` for the full research-layer data flow.
The system as a whole — idea structuring through adaptive research —
is best described as an **adaptive, evidence-driven decision-support
architecture**: every stage from hypothesis to validation
recommendation traces back to stored evidence with preserved
provenance, and every scoring step is deterministic and reproducible
from that evidence, with AI confined to extraction/classification/
generation roles that are always validated before use, never to
directly asserting a final number.

## Commercial / product layer (Phase 7)

Phases 1-6's intelligence architecture is frozen as of this phase — no
engine described above was rewritten. Phase 7 adds a product layer
around it:

```
Real dashboard (per-user aggregates, live from the database)
  ↓
Derived project status (computed from pipeline/plan/evidence/decision
  state — never a separately-stored, driftable field)
  ↓
Data-driven report (ReportService.buildReport — every number real or
  explicitly "Insufficient evidence", never invented)
  ↓
Score history (read from the already insert-only confidence_scores /
  opportunity_scores tables — no new storage needed)
  ↓
Shareable report (random-token, service-role-bypassed public read path)
  ↓
Audit trail (activity_logs, extended with entity_type/entity_id)
  ↓
Usage tracking (live counts against configurable plan limits, no
  payment integration yet)
```

See `docs/product-architecture.md`, `docs/security.md`, and
`docs/commercial-model.md` for the full detail.

## Layered structure

```
src/routes/                  TanStack Start file-based routes (UI)
src/components/venture/      Shared UI (AppShell, etc.)
src/lib/types/                domain.ts   — canonical TS shapes for every pipeline object
                               schemas.ts  — Zod schemas validating LLM output + API input
                               database.ts — typed Supabase client generic (mirrors SQL schema)
                               auth.ts     — AuthUser/AuthResult
src/lib/auth/                 requireAuth / redirectIfAuthenticated (route guards)
src/server/
  db/client.ts                 service-role Supabase client (background jobs, bypasses RLS)
  auth/supabase-server-client.ts  request-scoped, cookie-based, RLS-respecting client
  auth/session.ts               sign up/in/out, password reset, requireServerUser
  ai/client.ts                  generateStructured() — JSON-only + Zod-validated LLM calls
  repositories/                 typed CRUD per entity, DB row ⇄ domain type mapping
  services/
    idea-structuring.service.ts       ideaParser
    assumption-extraction.service.ts  assumptionExtractor
    hypothesis-generation.service.ts  hypothesisGenerator
    evidence-requirement.service.ts   evidenceRequirementGenerator
    validation-plan.service.ts        orchestrates the four above + approve/edit
    project.service.ts                project + business idea creation
    pipeline.service.ts               documents all pipeline stages (implemented + future)
  scoring/, validation/          confidence-engine.ts (v2), opportunity-score.ts (v2),
                                  project-confidence.ts, critical-uncertainty.ts,
                                  opportunity-dimension-mapper.ts, adaptive-engine.ts,
                                  validation-action-generator.ts — all deterministic
  evidence/                      quality scoring (evidence-quality.ts), severity mapping
                                  (severity.ts), EvidenceProvider abstraction + Demo/User providers
  research/                      source-quality.ts (deterministic authority-tier scoring),
                                  web-search-provider.ts (Anthropic web_search tool integration),
                                  research-planner.service.ts (research question + query generation)
  services/
    evidence-classification.service.ts  evidenceClassifier (the pipeline's one LLM call for evidence)
    evidence-normalization.service.ts   normalizeEvidence — assembles + validates persistable evidence
    evidence-gap.service.ts             gapDetector (deterministic)
    evidence-conflict.service.ts        conflictDetector (deterministic)
    evidence-collection.service.ts      orchestrates add/collect/edit/delete/re-evaluate
    scoring.service.ts                  orchestrates confidence/opportunity/validation-action recalculation
    research.service.ts                 orchestrates research runs + human review + pipeline re-entry
  api/                           createServerFn entry points the frontend actually calls
supabase/migrations/            0001_init_schema.sql, 0002_phase3_assumptions_and_hypothesis.sql,
                                 0003_phase4_evidence_engine.sql,
                                 0004_phase5_confidence_opportunity_validation.sql,
                                 0005_phase6_research_engine.sql, 0006_phase6_flagged_evidence_status.sql,
                                 0007_phase7_commercial.sql
```

## Why four separate AI services, not one prompt

Each of `ideaParser`, `assumptionExtractor`, `hypothesisGenerator`, and
`evidenceRequirementGenerator` is a standalone function with its own
system prompt, its own Zod schema, and its own persistence step. This
is deliberate:

1. **Each stage's output shape is different and independently
   validated.** A single mega-prompt returning one large JSON blob
   would need one schema covering everything, and a failure anywhere
   in that blob would invalidate the whole response — including parts
   that were actually fine. Splitting means a failure in hypothesis
   generation, for instance, still leaves a valid structured idea and
   valid assumptions persisted.
2. **Each stage consumes the previous stage's already-*persisted*,
   already-validated output**, not a fresh copy of everything from
   scratch. `hypothesisGenerator` reads real `BusinessAssumption` rows
   from the database (via `ValidationPlanService.runPipeline`), not
   a re-derived assumption list the model might drift on. This is what
   makes the pipeline a genuine multi-stage evidence structure instead
   of one call with elaborate formatting instructions.
3. **The evidence-requirement stage runs once per hypothesis**, with
   that specific hypothesis's category and the business's industry in
   context — this is the mechanism that produces domain-adapted
   requirements (see `evidence-engine.md`) rather than one generic list
   applied to every hypothesis regardless of type.

## Failure handling

Every AI service call goes through `generateStructured()`
(`src/server/ai/client.ts`), which:

1. Forces JSON-only output via the system prompt.
2. Parses the response; a parse failure raises `StructuredGenerationError` — no partial or best-effort object is manufactured.
3. Validates the parsed JSON against the caller's Zod schema; a schema violation also raises `StructuredGenerationError`.

`ValidationPlanService.runPipeline` catches this per stage, records the
error on the corresponding `business_ideas.*_status` /
`*_error` column, and **stops the run** rather than continuing with
synthetic data for the failed stage. The founder sees exactly which
stage failed and why, with a retry action — see
`src/routes/analysis.$id.tsx`'s `failed` screen state.

## Human review gate (Step 8)

`business_ideas.plan_status` is `draft` → `pending_approval` (implicit,
once all four stages complete) → `approved`. Nothing downstream of
approval exists yet, so this is currently a terminal, recorded action
rather than a trigger for further automated work — but the gate itself
(and the edit/delete affordances backing it — see
`src/server/api/validation-plan.ts`) is real and enforced: a plan is
never treated as validated business fact without an explicit founder
approval action, persisted with a timestamp
(`business_ideas.plan_approved_at`).
