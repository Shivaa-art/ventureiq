# VentureIQ — Evidence Engine

_Phase 4._

This document describes the technical data flow of the evidence layer:
collection, normalization, classification, relationships, coverage,
gaps, and conflicts. It makes no claim about patentability — see
`docs/invention-disclosure.md` for the same caveat applied to specific
mechanisms.

## Data flow

```
EvidenceProvider.collect() / UserEvidenceProvider.submit()
  │  → RawEvidenceContent (content only: source, type, url, title,
  │     date, summary, provenance, dataStatus — no scores, no direction)
  ▼
Classification
  │  user-submitted:  founder's own SUPPORTS/CONTRADICTS/NEUTRAL label,
  │                    used as-is (never overridden by the classifier)
  │  provider-sourced: evidenceClassifier (LLM, Zod-validated) determines
  │                    classification + reason + confidence
  ▼
Normalization (evidence-normalization.service.ts)
  │  → deterministic reliability/relevance/recency/independence scores
  │     (evidence-quality.ts) computed from source type, data status,
  │     publication date, and requirement linkage — never from the LLM
  ▼
Persist: evidence row + evidence_relationships row
  ▼
Recalculate (evidence-collection.service.ts, on every add/edit/delete):
  │  → coverage (EvidenceRepository.getCoverage — deterministic)
  │  → gaps (gapDetector — deterministic)
  │  → conflicts (conflictDetector — deterministic)
```

## 1. Evidence provider abstraction

`EvidenceProvider` (`src/server/evidence/provider.ts`) defines one
method, `collect()`, returning `RawEvidenceContent[]` — raw content
only. Two providers exist: `DemoEvidenceProvider` (synthetic,
`dataStatus: "demo"`, two deliberately-differently-framed items per
requirement so demo runs exercise classification and conflict
detection realistically) and `UserEvidenceProvider` (wraps a founder's
manual submission, `dataStatus: "user_provided"`). The interface is
shaped so a future `WebSearchProvider`, `NewsProvider`,
`GovernmentDataProvider`, `MarketDataProvider`, `GoogleTrendsProvider`,
or `SurveyProvider` slots in without changing anything downstream — the
classification and normalization stages only see `RawEvidenceContent`,
never provider-specific fields.

## 2. Evidence normalization

`normalizeEvidence()` (`evidence-normalization.service.ts`) is the one
function that assembles a persistable `Evidence` object. It never
invents a field: content comes from the provider, direction comes from
classification, and the four quality scores come from
`evidence-quality.ts`'s pure functions. The assembled object is run
through `EvidenceItemSchema.parse()` before it can reach a repository
insert — the same validate-before-persist discipline used everywhere
else in the pipeline.

## 3. Evidence provenance

Every evidence row carries `provenance` (provider id/version, the
query used if any, who collected it) exactly as the provider produced
it — normalization never overwrites this object, only reads from
`content.provenance` and passes it through. If a field genuinely isn't
known (e.g. no publication date), it's stored as `null`, never
fabricated — `recencyScore()` explicitly treats an unknown date as
neutral (50), not as evidence of being old.

## 4. Evidence classification

`evidenceClassifier` (`evidence-classification.service.ts`) is the only
LLM call in the evidence pipeline, and its output is constrained to
exactly `{ classification, reason, confidence }` — never a quality
score. It is invoked only for provider-sourced evidence without an
existing human label; user-submitted evidence's founder-chosen
direction is used as-is. If the classifier call itself fails, the
system falls back to an explicit `neutral`, `confidence: 0` result
labeled as a failed-classification placeholder — never a guessed
supports/contradicts.

## 5. Evidence relationships

`evidence_relationships` rows connect evidence to the hypothesis it
was collected for, with `relationship_type`
(`supports_hypothesis`/`contradicts_hypothesis`/`neutral_to_hypothesis`)
plus the classifier's `classification_confidence` and `reason` carried
over. An evidence item can also relate to other evidence rows (e.g.
`corroborates_evidence`) via the same table's `related_evidence_id`
column, though Phase 4 only populates the evidence↔hypothesis edges.

## 6. Evidence coverage

`EvidenceRepository.getCoverage()` — unchanged from Phase 1, still
purely deterministic — counts supporting/contradicting/neutral
evidence and the fraction of a hypothesis's evidence requirements
currently `met`. Coverage below 100% never implies the hypothesis is
false; it's shown alongside gaps, not folded into a single "bad" score.

## 7. Evidence gaps

`gapDetector` (`evidence-gap.service.ts`) is fully deterministic. Per
requirement, it distinguishes:

- **`no_evidence`** — zero real/user-provided items linked to the requirement.
- **`insufficient_evidence`** — some evidence exists but below the item-count bar for the requirement's declared `minimumEvidenceLevel` (1/2/3/3 items for low/medium/high/critical).
- **`low_quality_evidence`** — enough items exist, but their average reliability is below a fixed floor (40/100).
- **`contradictory_evidence`** — the requirement has both supporting and contradicting evidence (a requirement-level echo of the hypothesis-level conflict).

Severity (`severityFromImportance()`, `src/server/evidence/severity.ts`)
takes the higher of the hypothesis's and the requirement's own
`importance` — a gap is never flatly "critical" by default.

## 8. Conflict detection

`conflictDetector` (`evidence-conflict.service.ts`) checks whether a
hypothesis has at least one meaningfully-confident supporting item
**and** at least one meaningfully-confident contradicting item
(confidence ≥ 40). If so, both evidence-ID lists are stored verbatim in
`evidence_conflicts` — never averaged into a single number that would
hide the disagreement. Severity scales with the hypothesis's
importance, downgraded one level if neither side's average reliability
clears 50 (a conflict between two weak sources is real but less urgent
than one where a reliable source is involved).

## 9. Human-provided evidence

Captured via `UserEvidenceInputSchema` / `UserEvidenceProvider.submit()`
— title, description, source, URL, evidence type, date, notes, and an
explicit support-direction choice. It is never auto-trusted: quality
scores are still computed by the same deterministic functions as any
other evidence, and its classification confidence is fixed at 60 (not
100), documented in code as "as asserted by the founder, not
independently classified."

## 10. Demo/real separation

`dataStatus` is the single source of truth. `"demo"` and `"mock"` items
are excluded from gap/conflict detection (`isCountedEvidence()` in both
detector files) and from the Phase 1 confidence engine's calculation,
and are additionally scored ~70% lower by `evidence-quality.ts`'s
`applyDataStatusDiscount()` as a second, independent safeguard. In the
UI, every demo/mock item renders a `DEMO DATA` badge
(`src/components/venture/evidence-workspace.tsx`) that cannot be
suppressed by any founder action short of deleting the item.

## Re-evaluation ("Re-evaluate Evidence")

`EvidenceCollectionService.reevaluate()` recomputes coverage and
replaces the hypothesis's auto-generated, still-`open` gaps/conflicts
with a fresh detection pass — it does not duplicate evidence records,
and it never touches a gap/conflict a founder has already moved to
`reviewed`/`resolved` (tracked via the `auto_generated` flag added in
migration 0003). Adding, editing, or deleting any evidence item runs
this same recalculation automatically.
