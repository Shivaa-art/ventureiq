# VentureIQ — External Evidence Research Engine

_Phase 6._

This document describes the technical data flow of external evidence
retrieval: planning, source retrieval, source quality, grounded
extraction, provenance, human review, research runs, caching, and
integration with the Phase 4/5 confidence pipeline. It makes no claim
about patentability.

## Data flow

```
Hypothesis + Evidence Requirements + Existing Evidence
  ▼
research-planner.service.ts (LLM)
  │  → skips requirements already adequately covered (≥2 accepted
  │    real evidence items) — cost control
  │  → ResearchTask per remaining requirement, each with a research
  │    question + 1-3 search queries + reason (max 5 tasks/hypothesis,
  │    max 3 queries/task)
  ▼
web-search-provider.ts (LLM + Anthropic web_search tool)
  │  → for each query: real web search, then grounded extraction —
  │    claims extracted ONLY from URLs the tool actually returned
  ▼
source-quality.ts (deterministic)
  │  → domain → SourceCategory (government/academic/company_filing/
  │    established_news/industry_organization/company_website/
  │    professional_publication/general_website/unknown)
  │  → quality score, reliability score, independence score
  ▼
evidence-normalization.service.ts (Phase 4, unmodified)
  │  → Evidence row created with reviewStatus "pending_review"
  │    (never auto-trusted), researchSourceId linking back to
  │    research_sources
  ▼
Human review (accept / reject / flag)
  │  → only "accepted" evidence counts toward coverage, gaps,
  │    conflicts, or confidence (isCountedEvidence in evidence-gap.ts,
  │    evidence-conflict.ts, confidence-engine.ts, and the opportunity
  │    dimension mapper all now additionally require reviewStatus
  │    "accepted")
  ▼
Phase 4/5 pipeline (unmodified): coverage → gaps → conflicts →
  confidence → opportunity → critical uncertainty → next validation
```

## 1. Research provider abstraction

`web-search-provider.ts` implements the one MVP provider — reusing the
already-configured `ANTHROPIC_API_KEY` via the Anthropic Messages
API's native `web_search_20250305` tool, rather than integrating a
separate paid search API. Its narrow contract (one function: query in,
retrieved sources + grounded extractions out) is designed so
`NewsSearchProvider`, `GovernmentDataProvider`, and
`MarketDataProvider` could later implement the same shape without
touching `research.service.ts`, which only depends on that shape.

## 2. Research planning & query generation

`research-planner.service.ts` calls the LLM once per evidence
requirement that isn't already adequately covered, asking for a
research question and up to 3 specific search queries with a stated
reason each. The query text itself is explicitly never treated as
evidence — `research_queries` is a distinct table from
`research_sources`/`evidence`. A planning failure for one requirement
is caught and recorded on that task without aborting the run.

## 3. Source retrieval & grounded extraction

Each query is sent to `web-search-provider.ts`, which prompts the
model to search, then extract structured claims strictly from what the
retrieved sources say — the system prompt explicitly separates "the
source states X" from "therefore Y," per Phase 6 Step 8. As an
anti-fabrication safeguard, every extraction's `sourceUrl` is
cross-checked against the URLs the `web_search` tool actually returned
(`web_search_tool_result` content blocks); an extraction citing any
other URL is silently discarded rather than trusted.

## 4. Source quality

`source-quality.ts` categorizes a domain into one of 9 authority tiers
using documented pattern rules (`.gov`/`.mil` → government;
`.edu`/`scholar.google.*` → academic; a short allow-list of established
outlets → established_news; etc.) — never a single "official site =
100" shortcut. Each tier has a base authority score, further adjusted
by recency and content accessibility (a snippet-only result scores
lower than one with a successful extraction) to produce the ranking
score used to select which retrieved sources proceed to persistence.

## 5. Source deduplication

Reuses the same `computeSourceFingerprint()` from Phase 5
(`evidence-quality.ts`) — URL host+path normalization, or normalized
title when no URL — so three articles syndicating the same press
release collapse to one independent data point, consistent with how
the confidence engine already treats fingerprint-sharing evidence.
`ResearchRepository.findExistingSourceByFingerprint()` additionally
prevents re-persisting (and re-paying the LLM extraction cost for) a
source already retrieved for the same hypothesis in an earlier run.

## 6. Provenance

Every evidence row created from research carries `researchSourceId` (a
real foreign key to the `research_sources` row with the URL, title,
domain, publication date if known, retrieval date, and source
category) plus the standard `provenance` JSON (`providerId: "web-search-provider"`,
the exact query used). The UI always links out to the original URL —
external evidence is never rendered without a clickable source.

## 7. Evidence status vs. review status

Two related but distinct fields: `research_sources.status`
(`pending`/`retrieved`/`source_unavailable`/`duplicate`) tracks whether
the SOURCE was actually retrieved; `evidence.review_status`
(`pending_review`/`accepted`/`rejected`/`source_unavailable`/`extraction_failed`)
tracks the HUMAN review gate on any resulting evidence. A source that
retrieves fine but yields no usable extraction is recorded as
`source_unavailable` at the source level without any evidence row
being created at all — nothing is ever fabricated to fill that gap.

## 8. Human review

External evidence is never auto-trusted. Every extracted item starts
`pending_review`; the founder can Accept, Reject, or (in the UI) Flag
it for later. Only `reviewEvidence(id, "accepted")` triggers the
Phase 4 re-evaluation (`EvidenceCollectionService.reevaluate`) and
Phase 5 recalculation (`ScoringService.recalculateAll`) chain —
rejecting or leaving something pending never touches coverage, gaps,
conflicts, confidence, or opportunity score.

## 9. Research runs

Each "Research this hypothesis" / "Refresh Research" click creates a
new `research_runs` row (`queued`→`running`→`completed`/`partial`/`failed`)
— never overwrites a prior run's tasks/queries/sources/evidence. A
run's final status genuinely reflects how many of its tasks succeeded
(`partial` if some failed, `failed` only if none succeeded), giving an
auditable history rather than a single mutable "latest research"
state. No `setTimeout`-based fake progress anywhere — the UI's run
status badge reflects the actual persisted `research_runs.status`.

## 10. Caching / cost control

Three explicit limits (`MAX_RESEARCH_TASKS_PER_HYPOTHESIS = 5`,
`MAX_QUERIES_PER_TASK = 3`, `MAX_SOURCES_PER_QUERY = 3`,
`MAX_SOURCES_PER_RUN = 20`) bound worst-case LLM/search cost per run.
Requirements with ≥2 already-accepted real evidence items are skipped
by the planner entirely. Sources already retrieved for a hypothesis
(by fingerprint) are skipped rather than re-extracted. None of this
caching is silent — skip decisions are implicit in which tasks/sources
appear in a run's results, and the mechanism is documented here rather
than left implicit in code.

## 11. Failure handling

Every layer fails closed, never open: a planning failure marks that
one task `failed` with the real error message; a query that finds no
sources is recorded as zero sources, not a fabricated one; a source
with no usable extraction becomes `source_unavailable`, never an
invented "neutral, no evidence" placeholder; a JSON-parse or schema
validation failure on the model's extraction output raises
`StructuredGenerationError`, caught per-query so it doesn't abort
sibling queries in the same task. The founder can always retry via
"Refresh Research."

## 12. Integration with the confidence engine

No second scoring system was created. Accepted external evidence flows
through the exact same `EvidenceRepository`/`ConflictGapRepository`
tables and the exact same `confidence-engine.ts` / `opportunity-score.ts`
/ `critical-uncertainty.ts` / `adaptive-engine.ts` deterministic
formulas built in Phases 4-5 — the only change those files needed was
extending their `isCountedEvidence` filters to also require
`reviewStatus === "accepted"`, so a pending-review external item is
excluded from calculations exactly the way demo evidence already was.
