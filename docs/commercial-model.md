# VentureIQ — Commercial Model

_Phase 7. Describes the subscription-ready architecture prepared this
phase — no payment processing is implemented or claimed to be live._

## Current state: no payments implemented

`public.users.subscription_status` defaults to `active` for every
account regardless of plan, `subscription_provider` and
`subscription_id` are `null` for every account. There is no Stripe (or
other payment provider) integration anywhere in the codebase. The
pricing page explicitly tells the visitor billing isn't live yet.

## What "subscription-ready" means here

Three columns exist on `public.users` so a future payment integration
has somewhere to write without a schema migration blocking it:

- `plan` (`free` | `pro` | `enterprise`) — already existed since Phase 1.
- `subscription_status` (`active` | `past_due` | `canceled` | `trialing`)
- `subscription_provider` (e.g. future value `"stripe"`)
- `subscription_id` (the provider's subscription/customer reference)

None of these fields are read by any billing-enforcement logic today —
they exist purely as the landing spot for a future integration.

## Usage limits (configured, not billed)

`src/server/services/usage.service.ts`'s `PLAN_LIMITS` maps each plan
tier to a project count and monthly research-run count:

| Plan | Projects | Research runs / month |
|---|---|---|
| Free | 2 | 5 |
| Pro | 10 | 30 |
| Enterprise | Unlimited | Unlimited |

`UsageService.getUsage()` computes current usage live (see
`docs/product-architecture.md`, "Usage model") and returns
`remaining.projects` / `remaining.researchRunsThisMonth`, which the UI
can use to warn a user approaching a limit. **These limits are not
currently enforced as a hard block anywhere** — no server function
checks usage before allowing an action. Wiring enforcement in (and
deciding the UX for "you've hit your limit") is deferred to a future
phase alongside actual payment integration, per Phase 7's explicit
scope boundary.

## Why limits aren't hardcoded into business logic

`PLAN_LIMITS` is a single exported configuration object, not scattered
magic numbers — any service that needs a limit imports it from one
place. This is what "do not hardcode pricing assumptions into business
logic" (Phase 7, Step 11) means in practice: changing the Free tier
from 2 to 3 projects is a one-line change in `usage.service.ts`, not a
hunt through the codebase for places that assumed "2."

## Path to a real integration (not built yet)

A future phase adding Stripe (or similar) would reasonably:
1. Add a webhook handler updating `subscription_status`/`subscription_id`
   on `checkout.session.completed` / `customer.subscription.updated` events.
2. Add an enforcement check (likely in `UsageService` or a thin
   middleware around the relevant `createServerFn` handlers) that
   rejects an action when `remaining.*` hits zero for a Free-tier user.
3. Update the pricing page's CTA and disclaimer copy once billing is
   genuinely live.

None of this is implemented in Phase 7 — this section exists only to
document that the current schema and usage-counting design don't
block it, not to claim it's coming on any timeline.
