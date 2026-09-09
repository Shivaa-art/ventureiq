# VentureIQ — Confidence Engine

_Phase 5. Formula version: `confidence-v2`._

No LLM call exists in this file's calculation path. Given the same
evidence, gap, and conflict rows, `computeConfidenceScore()` always
returns the same number — that reproducibility is what lets the system
answer "why is confidence 68%?" by pointing at stored component values.

## Formula

```
base            = weighted average of (evidence quality, source reliability,
                   relevance, recency, independence) across INDEPENDENT
                   evidence, plus (evidence coverage % × coverage weight)

contradiction   = base × (contradicting / total directional evidence) × contradictionPenalty weight

gap penalty     = 100 × severityWeightedScore(open gaps) × gapPenalty weight × hypothesis importance rank

conflict penalty = 100 × severityWeightedScore(open conflicts) × conflictPenalty weight

final           = clamp(base − contradiction − gap penalty − conflict penalty, 0, 100)
```

Default weights (`DEFAULT_CONFIDENCE_WEIGHTS`, all configurable
constants):

| component | weight |
|---|---|
| evidence quality | 0.20 |
| source reliability | 0.15 |
| relevance | 0.10 |
| recency | 0.10 |
| independence | 0.10 |
| coverage | 0.20 |
| contradiction penalty | 0.25 (multiplier) |
| gap penalty | 0.15 (multiplier) |
| conflict penalty | 0.20 (multiplier) |

The result is bucketed into a discrete `confidence_level` —
`very_low` (<20), `low` (<40), `medium` (<60), `high` (<80),
`very_high` (≥80) — stored alongside the numeric score.

## Independence deduplication

Before any averages are computed, evidence sharing a
`source_fingerprint` (see `evidence-quality.ts`'s
`computeSourceFingerprint`) is collapsed to one representative item —
the one with the highest classification confidence. Three articles
syndicating the same press release contribute as one independent data
point, not three. This is a simple, explainable MVP mechanism: exact
fingerprint match only, no fuzzy source-similarity modeling.

## Explainability

Every score is stored with:

- `explanation` — a general narrative sentence set.
- `supportingFactorSummary` — a `+`-prefixed list (e.g. "+ 3 independent supporting item(s); + high average evidence quality; + strong evidence requirement coverage.").
- `contradictingFactorSummary` — a `-`-prefixed list (e.g. "- 1 independent contradicting item(s); - 1 high/critical evidence gap(s).").

All three are built from the exact same component values used in the
arithmetic above — the explanation can never assert a factor the
calculation didn't actually use, because both are derived from one
shared set of inputs in the same function call.

## Confidence vs. status (kept deliberately separate)

`deriveHypothesisStatus()` is the only place a hypothesis's `status`
is set after creation, and even it does not simply threshold the
confidence number: a hypothesis needs both reasonable confidence AND a
non-dominant contradicting-evidence balance to be marked `validated`.
A hypothesis can have `high`/`very_high` confidence and still not be
`validated` if its formal validation criteria haven't been separately
confirmed — confidence measures "how much do we trust the current
evidence read," not "is this proven." See Phase 5, Step 4.

## Project-level confidence

`project-confidence.ts` computes an importance-weighted average across
all hypotheses (weights: low=1, medium=2, high=3, critical=5) — never
a flat average — plus a separate average restricted to `critical`
hypotheses, and identifies the single weakest critical hypothesis by
its confidence score. See `docs/architecture.md` for how this feeds
the Project Overview UI panel.
