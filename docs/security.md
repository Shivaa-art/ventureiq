# VentureIQ — Security Review

_Phase 7, Step 18. A production-oriented review of what exists as of
this phase, not a formal penetration test or third-party audit._

## Authentication

Supabase Auth (email/password), session managed via the request-scoped
SSR client (`src/server/auth/supabase-server-client.ts`), cookies set
`httpOnly`, `secure` in production, `sameSite: lax`. Every protected
route's `beforeLoad` calls `requireAuth`, which re-derives the session
server-side from cookies on every navigation — never trusts client
state alone.

## Authorization / RLS

Every table owned by a user is scoped by Postgres RLS through a
consistent transitive-ownership chain:
`project.user_id = auth.uid()`, and every descendant table
(business_ideas → hypotheses → evidence/evidence_requirements →
evidence_relationships/gaps/conflicts, research_runs → tasks → queries/
sources, validation_actions/results, user_decisions, reports) joins
back up to that same `projects.user_id` check. All mutating API
handlers additionally call `requireServerUser()` before touching the
database, and use the RLS-respecting client (`getSupabaseServerClient()`)
rather than the service-role client — so even a bug in application-level
logic would still be blocked at the database layer.

**Deliberate, narrow exceptions** (both documented at their call sites):
1. `public.users` INSERT is service-role only — a regular user cannot
   fabricate a profile row for another user ID; only the post-auth
   `ensureUserProfile()` step writes it, using the ID Supabase Auth
   itself just confirmed.
2. `ReportService.getSharedReport()` uses the service-role client for
   the one public, unauthenticated endpoint (`getSharedReport`) — a
   visitor with a valid share link has no session for RLS to check, so
   the 128-bit random token is the authorization mechanism instead, and
   only rows with `share_enabled = true` are ever returned.

## Project / evidence / research ownership

Verified by inspection: every server function that accepts an ID
(`businessIdeaId`, `hypothesisId`, `evidenceId`, etc.) resolves data
through a repository using the RLS-respecting client — there is no
code path where a raw ID from the client is used to fetch data via the
service-role client outside the two exceptions above. A user changing
a URL/ID to someone else's business idea, hypothesis, or evidence
receives an empty/null result from Postgres (RLS silently filters the
row out), not the other user's data, and not a distinguishing error
that would leak whether the ID exists.

## Share-token security

- Generated with `crypto.getRandomValues` (16 bytes / 128 bits) — not
  `Math.random()`, not a sequential ID.
- A fresh token is issued on `createShareLink`; there is no "reactivate
  the old token" path — disabling and re-enabling sharing always
  produces a new, unrelated token.
- The public report endpoint filters on `share_enabled = true`, so
  disabling a link immediately invalidates it even if the token were
  somehow retained by a third party.
- The shared report reuses the exact same `ReportService.buildReport()`
  assembly the owner sees — it does not separately serialize raw
  database rows, so there's no risk of an internal-only field being
  exposed through a code path that forgot to filter it. (Internal UUIDs
  for hypotheses/evidence/etc. do appear in the shared JSON payload as
  React keys/identifiers; these are opaque and not independently
  useful for accessing other data, since every endpoint they could be
  used against still requires either a valid session or the same share
  token.)

## Server-only secrets

`SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are read only from
`src/server/**` modules, each with a runtime guard
(`if (typeof window !== "undefined") throw`) that fails loudly if the
module is ever accidentally bundled for the browser. No `VITE_`-prefixed
Supabase/Anthropic env vars exist anywhere in the codebase, so nothing
requires or risks exposing these secrets to the client bundle.

## API endpoints / input validation

Every `createServerFn` handler in `src/server/api/**` validates its
input with a Zod schema via `.validator()` before the handler body
runs — untyped `data: unknown` is never passed through to a repository
call unchecked. This is the same validate-before-persist discipline
used for LLM output throughout Phases 1-6, applied uniformly to
user-facing input as well.

## Error handling

`src/lib/errors.ts` classifies errors into user-facing categories
(authentication/authorization/database/ai/research/validation/
rate_limit/unknown) and returns only a generic, safe message per
category — never a stack trace, raw database error, or API key. Server
console logging still captures the real error for operator debugging;
only the client-facing string is sanitized.

## Rate limits

Not implemented in this phase beyond the plan-based usage limits
tracked by `UsageService` (checked, not yet hard-enforced — see
`docs/commercial-model.md`). No per-endpoint request-rate limiting
exists yet; this is a known gap for a future phase, not something this
review should be read as claiming is covered.

## Demo data isolation

`dataStatus` (`demo`/`mock` vs. `real`/`user_provided`) is the single
source of truth throughout the evidence pipeline (Phases 4-6) and is
never counted toward coverage, gaps, conflicts, confidence, or
opportunity score. Dashboard/report aggregates (Phase 7) are built
from real per-user rows only — there is no shared "demo account" whose
data could leak into another user's dashboard metrics, because every
query is scoped by the authenticated user's own `user_id` via RLS.

## Known gaps (not yet addressed)

- No per-endpoint rate limiting.
- No CSRF-specific hardening beyond `sameSite: lax` cookies (TanStack
  Start's own request handling; not independently audited here).
- No formal penetration test or third-party security review has been
  performed — this document is an internal, code-level review only.
