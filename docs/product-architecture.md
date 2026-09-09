# VentureIQ — Product Architecture

_Phase 7._

This document describes the commercial/product layer built around the
frozen Phases 1-6 intelligence architecture: dashboard, project
lifecycle, reporting, sharing, usage, and audit trail.

## Product lifecycle

```
Landing page (unauthenticated)
  ↓
Sign up / Sign in (Phase 2)
  ↓
Dashboard — empty state ("Start your first project") or real project list
  ↓
New project (Phase 3 intake form)
  ↓
Analysis screen — pipeline run, plan review/approve (Phase 3)
  ↓
Evidence workspace — add/collect/research/review evidence (Phase 4/6)
  ↓
Project overview — confidence, opportunity score, recommended action (Phase 5)
  ↓
Human decision — Proceed / Validate Further / Modify Idea / Reject
  ↓
Report — data-driven summary, printable, optionally shareable
```

## Project lifecycle (derived status)

`src/server/services/project-status.ts` computes a project's
presentation status **on read**, from existing pipeline/plan/evidence/
decision state — it is never stored as its own mutable field:

| Status | Condition |
|---|---|
| `draft` | No hypotheses generated yet |
| `validation_plan` | Hypotheses exist, plan not yet approved |
| `researching` | Plan approved, no real evidence collected yet |
| `review` | Plan approved, at least one evidence item still `pending_review` |
| `ready_for_decision` | Plan approved, all evidence reviewed, confidence calculated |
| `completed` | A human decision has been recorded |
| `failed` | Any pipeline stage failed and the plan was never approved |

This derive-don't-duplicate approach means the status shown can never
drift from the data that actually defines it — there is no second
"status" column to fall out of sync with the real pipeline state.

## User lifecycle

Sign up → email confirmation (if enabled) → first sign-in creates a
`public.users` profile row (service-role upsert, Phase 2) → user
creates projects, runs research, records decisions → all actions are
audit-logged (`activity_logs`, see below) → usage is tracked live
against configurable plan limits (no payment processing yet).

## Usage model

`src/server/services/usage.service.ts` computes usage live from
existing rows (projects, research runs this month, research sources,
validation actions) rather than a separate mutable counter table —
the same principle as derived project status: no second source of
truth to drift. `PLAN_LIMITS` (free/pro/enterprise) is a configuration
table, not hardcoded into business logic, and is checked but not yet
enforced with a hard block (Phase 7 explicitly defers payment
integration; see `docs/commercial-model.md`).

## Score history

`ScoringRepository`'s `confidence_scores` and `opportunity_scores`
tables have been insert-only (a fresh row per recalculation, never
updated in place) since Phase 1/5. `ReportService.getScoreHistory()`
reads this existing history directly — no new storage was needed to
support "show scores over time"; the history already existed as a
side effect of how recalculation was always persisted.

## Reporting & sharing

`ReportService.buildReport()` assembles a fully data-driven
`ReportSnapshot` from the real database — executive summary, opportunity
overview, hypotheses, evidence, research summary, critical
uncertainties, recommended next validation, and decision. Every number
either comes from a real row or is shown as "Insufficient evidence"
(never a fabricated score). Sharing uses a per-project random token
(`business_ideas.share_token`, 128-bit, generated via
`crypto.getRandomValues`) — the one deliberate, narrow service-role
RLS bypass in the app, scoped to a single business idea and gated on
`share_enabled = true`. See `docs/security.md` for the full review.

## Audit trail

`src/server/services/audit.service.ts` wraps `activity_logs` (extended
in this phase with `entity_type`/`entity_id` columns) with a fixed set
of tracked actions: project created, plan approved, evidence added/
accepted/rejected/flagged, research started/completed, validation
result recorded, decision recorded, share link created/disabled.
Logging happens at the API layer, immediately after each underlying
operation succeeds — the natural user-facing action boundary, chosen
so adding audit coverage never required modifying already-approved
service internals from earlier phases.
