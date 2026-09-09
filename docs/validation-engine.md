# VentureIQ — Opportunity Score & Adaptive Validation Engine

_Phase 5. Formula versions: `opportunity-v2`, `dimension-mapping-v1`,
`critical-uncertainty-v1`, `validation-ranking-v1`._

## Opportunity Score

`opportunity-dimension-mapper.ts` maps each hypothesis's category to
one of the 11 opportunity dimensions (e.g. `customer_problem` →
`customer_pain`, `willingness_to_pay`/`revenue` → `revenue_potential`).
A dimension with no mapped hypotheses is marked `applicable: false`
(NOT_APPLICABLE) and excluded entirely from aggregation — never scored
as zero.

For each applicable dimension, `score` and `confidence` are two
genuinely different axes, both derived deterministically from the
mapped hypotheses' already-computed confidence scores and evidence
counts:

- **`confidence`** — average of the mapped hypotheses' `finalConfidence`.
- **`score`** — "favorability": if a hypothesis's evidence leans
  supporting, its contribution is its confidence (sure + supports =
  high score); if it leans contradicting, its contribution is
  `100 − confidence` (sure + contradicts = low score). This is what
  lets "Score 85, Confidence 35" (evidence is thin but what exists
  looks good) and "Score 65, Confidence 90" (evidence is solid but
  only moderately favorable) both be represented honestly — see Phase
  5, Step 8.

`opportunity-score.ts` then aggregates dimensions into two published
numbers:

- **`rawScore`** (RAW_SCORE) — weighted average of `score` only.
- **`overallScore`** (CONFIDENCE_ADJUSTED_SCORE) — the same weighting,
  but each dimension's contribution is additionally scaled by
  `confidence / 100`, so a high-scoring but low-confidence dimension
  pulls the adjusted figure down relative to the raw one.

Both are stored (`opportunity_scores.raw_score` and `.overall_score`),
so the UI can show the gap between them rather than collapsing to one
number.

## Critical uncertainty

`critical-uncertainty.ts` ranks every hypothesis by:

```
uncertaintyScore = 100 × (
  importanceWeight × 0.40 +
  (1 − confidence/100) × 0.30 +
  (1 − coveragePct/100) × 0.15 +
  maxOpenConflictSeverity × 0.15
)
```

The highest-ranked hypothesis is *the* critical uncertainty. A
critical-importance hypothesis that's already well-evidenced (high
confidence, high coverage) scores low here — importance alone doesn't
make something urgent; it has to still be genuinely unresolved.

## Adaptive validation actions

`validation-action-generator.ts` turns each open evidence gap into a
candidate action using a fixed method-suggestion table keyed by
hypothesis category (`willingness_to_pay` → pricing experiment,
`customer_problem` → customer interviews, `market_demand` → landing-
page test, `competition` → competitor comparison, `supply` → supplier
quotation experiment, etc. — the full table covers all 12 hypothesis
categories). Each candidate's four 0-100 input scores come from the
gap's severity, the hypothesis's importance, and the confidence score
— never invented per-candidate.

`adaptive-engine.ts`'s `rankValidationActions()` then computes:

```
expectedInformationValue =
  (businessImpact × 0.4 + evidenceUncertainty × 0.3 + evidenceGap × 0.3)
  × (1 − (validationCost/100) × 0.25)
```

sorted descending, with a discrete `priority` tier (`critical` only
for the #1-ranked candidate scoring ≥60; `high` ≥60; `medium` ≥35;
else `low`) — deliberately wide bands so "do not mark everything
critical" holds.

Regenerating actions (`ScoringService.generateValidationActions`)
deletes only still-`recommended` rows first — `accepted`, `completed`,
and `dismissed` actions are preserved as history, the same idempotency
pattern used for gap/conflict re-evaluation in Phase 4.

## The adaptive loop (Phase 5, Step 15)

```
Validation action recommended
  ↓ founder carries it out, records result via recordValidationResult()
New evidence created (dataStatus: user_provided, tagged "experiment")
  ↓ EvidenceCollectionService.addUserEvidence() — recalculates
    coverage / gaps / conflicts (Phase 4 pipeline, unmodified)
  ↓ ScoringService.recalculateAll()
Updated hypothesis confidence (per hypothesis, confidence-engine.ts)
  ↓
Updated project confidence + opportunity score
  ↓
Updated critical uncertainties
  ↓
Updated (regenerated) validation actions — possibly a different #1 recommendation
```

`ScoringService.recordValidationResult()` is the single function that
runs this whole chain in one call — it is what makes the loop a real,
executable mechanism rather than a diagram: recording one result can
change what the system recommends validating next.

## Human decision

`recordDecision()` persists `PROCEED` / `VALIDATE_FURTHER` /
`MODIFY_IDEA` / `REJECT` plus free-form notes and a `decision_basis`
field. Nothing in the codebase transitions a business idea toward
"invested" or auto-acts on a decision — the system never recommends a
decision on the founder's behalf beyond surfacing the next validation
action; the decision itself is always a human-initiated write.
