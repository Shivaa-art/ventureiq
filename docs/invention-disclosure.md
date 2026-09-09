# VentureIQ — Technical Mechanism Notes

_Last updated: Phase 3._

**This document describes technical mechanisms implemented in the
codebase for internal reference and potential future patentability
review. It makes no claim, express or implied, that any mechanism
described here is novel, non-obvious, or otherwise patentable. That
determination has not been made and would require qualified legal
review.**

## 1. Unstructured input → structured business variables

**Mechanism:** `src/server/services/idea-structuring.service.ts`
(`parseIdea`).

A founder's free-text submission (business name, description, and up
to 10 optional free-text fields — see `RawBusinessIdeaInput`) is sent
to an LLM with a system prompt constraining the response to a single
JSON object matching `StructuredBusinessIdeaSchema` exactly. The raw
input and the structured output are stored in **separate columns**
(`business_ideas.raw_*` vs. `business_ideas.structured`), so the
system never loses or overwrites the founder's original wording, and
structuring can be re-run without re-collecting input.

The output is rejected (not coerced, not partially accepted) if it
fails Zod validation — see mechanism 6 below.

## 2. Assumption extraction

**Mechanism:** `src/server/services/assumption-extraction.service.ts`
(`extractAssumptions`).

Operates on the *structured* idea (not the raw text), producing 1-8
assumption objects, each with a `source` field constrained by schema
to the literal `"ai_inferred"` — the type system makes it structurally
impossible for this code path to label an assumption as
`"user_provided"`, since that value would require a separate,
not-yet-built founder-input path to originate it. This is the
mechanism referenced in Phase 3 Step 3's requirement that "AI-inferred
assumptions" never be presented as facts: the provenance tag is
enforced at the schema level, not by a UI convention that could be
bypassed.

## 3. Assumptions → testable hypotheses

**Mechanism:** `src/server/services/hypothesis-generation.service.ts`
(`generateHypotheses`) + `HypothesisRepository.createMany`.

The hypothesis generator is given the structured idea **and** the
actual persisted assumption rows (with their 0-based array index), and
asked to sharpen assumptions into falsifiable statements. Where a
hypothesis includes a numeric bar, the model must also emit
`thresholdType: "ai_proposed"` — `GeneratedHypothesisSchema` uses a
Zod `.refine()` that makes `thresholdType` **required** whenever
`threshold` is present, so a threshold can never be stored without its
provenance label attached.

Two properties are enforced entirely in application code, not
requested of the model:

- **Status is never model-supplied.** `GeneratedHypothesisSchema` has
  no `status` or `confidence` field at all; `HypothesisRepository.createMany`
  hard-codes `status: "untested"` and `confidence: 0` for every insert,
  regardless of what the model returns.
- **Category is closed-set.** The model may only choose from the 12
  categories in `HypothesisCategorySchema`; an unrecognized category
  string fails validation and the hypothesis generation stage is
  treated as failed for that run (see `docs/architecture.md`,
  "Failure handling").

Traceability from hypothesis back to the assumption that produced it
is stored as a real foreign key (`hypotheses.assumption_id`), not
inferred after the fact from text similarity.

## 4. Hypothesis-specific evidence requirement generation

**Mechanism:** `src/server/services/evidence-requirement.service.ts`
(`generateEvidenceRequirements`).

Called once **per hypothesis** (a loop in
`ValidationPlanService.runPipeline`, not a single batched call for all
hypotheses), with that hypothesis's category, statement, and threshold
in context alongside the business's industry and location. This
per-hypothesis invocation is what produces the domain-specific
divergence described in mechanism 5 — the same prompt template applied
to a SaaS pricing hypothesis and a restaurant pricing hypothesis yields
structurally different evidence types because the industry context
differs, not because of separate code paths per industry.

## 5. Domain-specific evidence requirement variation

**Mechanism:** system prompt in
`evidence-requirement.service.ts`, combined with mechanism 4's
per-hypothesis invocation.

There is no hand-authored per-industry template or lookup table. The
system prompt explicitly instructs against generic, industry-agnostic
requirement lists and gives contrastive examples (restaurant vs. SaaS
vs. manufacturing vs. agriculture) purely as calibration for the
*style* of specificity expected, not as a mapping the model looks up.
The actual requirement content for a given business is generated fresh
from that business's own `StructuredBusinessIdea.industry`,
`.location`, and `.businessModel` fields plus the specific hypothesis
text — so a new industry not present in the prompt's examples still
receives requirements adapted to its own stated context, rather than
falling back to a generic default or an unmatched-industry branch.

## 6. Output validation before persistence

**Mechanism:** `generateStructured()` in `src/server/ai/client.ts`,
used identically by all four generation services.

Every LLM call in the pipeline goes through one shared function that:
(a) instructs JSON-only output, (b) attempts `JSON.parse`, (c) runs the
parsed value through a Zod schema, and (d) returns the validated,
strongly-typed object **or** throws `StructuredGenerationError` — there
is no code path in which an LLM response reaches a repository's
`insert` call without having passed a schema check first. This is the
single choke point enforcing "the AI output MUST be validated before
being persisted" (Phase 3, Step 2) across all four services uniformly,
rather than each service reimplementing its own validation.

## 8. Provider-agnostic evidence collection with deterministic quality scoring

**Mechanism:** `src/server/evidence/provider.ts` (`EvidenceProvider`,
`RawEvidenceContent`) + `src/server/evidence/evidence-quality.ts`.

Every evidence source — demo, founder-submitted, or a future live
search/news/market-data integration — implements the same one-method
interface and returns only raw content (source, type, URL, title,
date, summary, provenance, data status). None of the four quality
scores (reliability, relevance, recency, independence) or the final
support-direction classification are a provider's responsibility. This
separation is what makes it structurally impossible for a provider to
assert its own trustworthiness: reliability and independence are
looked up from a fixed table keyed by source type (government/
regulatory sources scored higher than a provider could self-report),
recency is computed from the actual publication date against the
current date, and demo/mock data is discounted 70% by
`applyDataStatusDiscount()` independent of, and in addition to, being
excluded from downstream calculations entirely by data-status filters.

## 9. Human-label-preserving vs. model-classified evidence

**Mechanism:** `src/server/services/evidence-collection.service.ts`
(`addUserEvidence` vs. `collectDemoEvidence`).

The pipeline has two distinct paths into the same evidence table,
distinguished by whether a human already asserted a support direction.
Founder-submitted evidence's chosen SUPPORTS/CONTRADICTS/NEUTRAL label
is written through unchanged — `evidenceClassifier` (the LLM call) is
never invoked for it. Provider-collected content, which has no
pre-existing direction, is always run through `evidenceClassifier`,
whose output is constrained by `EvidenceClassificationSchema` to
exactly `{classification, reason, confidence}` and rejected outright
(with an explicit neutral/zero-confidence fallback, never a guess) if
the model's response doesn't validate or the call fails. This is the
mechanism that keeps "the founder said so" and "the model inferred it"
structurally distinguishable all the way through storage
(`classification_reason` records which case applies for every row).

## 10. Deterministic, requirement-aware gap severity

**Mechanism:** `src/server/evidence/severity.ts`
(`severityFromImportance`) + `src/server/services/evidence-gap.service.ts`.

Gap severity is computed as the higher-ranked of the hypothesis's own
`importance` and the specific evidence requirement's `importance` —
not a flat default, and not requested of an LLM. This means the same
gap type (e.g. `no_evidence`) surfaces at different severities
depending on how consequential the specific missing requirement is to
the specific hypothesis, using a fixed four-level rank table
(`low < medium < high < critical`) rather than a heuristic score.

## 11. Non-averaging conflict detection with reliability-aware downgrade

**Mechanism:** `src/server/services/evidence-conflict.service.ts`
(`detectConflicts`).

When a hypothesis has both a meaningfully-confident supporting item and
a meaningfully-confident contradicting item (confidence ≥ 40, a fixed
threshold), the two full evidence-ID lists are persisted verbatim
rather than the evidence being combined into one net score — this is
enforced structurally by the schema (`DetectedConflictSchema` requires
both `supportingEvidenceIds` and `contradictingEvidenceIds` to be
non-empty) rather than left to a downstream reader's discretion. A
secondary rule downgrades severity by one level when neither side's
average source reliability clears 50, so a conflict between two weak,
low-reliability sources is flagged with lower urgency than one
involving at least one reliable source — again computed from stored
reliability scores, not asked of the model.

## 12. Idempotent re-evaluation without discarding human review

**Mechanism:** `evidence_gaps.auto_generated` /
`evidence_conflicts.auto_generated` columns (migration 0003) +
`ConflictGapRepository.deleteAutoGeneratedOpenGaps` /
`deleteAutoGeneratedOpenConflicts` + `EvidenceCollectionService.reevaluate()`.

Re-running gap/conflict detection (triggered automatically on every
evidence add/edit/delete, or manually via "Re-evaluate Evidence")
replaces only the gaps/conflicts that are both system-generated
(`auto_generated = true`) and still in their initial `open` status —
anything a founder has already moved to `reviewed`/`resolved` is left
in place. This is what allows the detectors to be re-run freely without
either accumulating duplicate rows over time or silently overwriting a
human's prior review decision.

## 13. Human review and plan modification before downstream use

**Mechanism:** `business_ideas.plan_status` state machine +
`src/server/api/validation-plan.ts` (`updateHypothesis`,
`deleteHypothesis`, `updateEvidenceRequirement`,
`deleteEvidenceRequirement`, `removeAssumption`,
`approveValidationPlan`) + `src/routes/analysis.$id.tsx` review screen.

Once all four generation stages complete, the founder is shown every
assumption, hypothesis, and evidence requirement with edit controls
(importance, evidence level) and delete affordances, backed by real
mutating server functions — not a read-only preview. `plan_status`
only transitions to `approved` via an explicit founder action
(`approveValidationPlan`), which stamps
`business_ideas.plan_approved_at`. As of Phase 5, plan approval
triggers one baseline run of the confidence/opportunity/validation-
action chain (`ScoringService.recalculateAll`), so the founder sees an
initial (necessarily low, since no evidence exists yet) reading
immediately rather than a blank panel — but the founder's own edits
made before approval remain the version of record, never overwritten
by anything computed afterward.

## 14. Independence-aware confidence calculation

**Mechanism:** `src/server/scoring/confidence-engine.ts`
(`deduplicateByIndependence`).

Before computing any average or count, evidence items sharing a
`source_fingerprint` — a deterministic hash of the URL's host+path, or
the normalized source name when no URL exists (`computeSourceFingerprint`
in `evidence-quality.ts`) — are collapsed to a single representative
item (the one with the highest classification confidence). Three
articles syndicating the same press release contribute one independent
data point to the confidence calculation, not three. This is a
structural safeguard against evidence-count inflation: it operates on
every confidence calculation uniformly, not as an opt-in check a
caller could forget.

## 15. Explicit, separately-versioned gap and conflict penalty terms

**Mechanism:** `confidence-engine.ts`'s `gapPenaltyAmount` /
`conflictPenaltyAmount` computation, `severityWeightedScore()`.

Rather than folding open gaps and conflicts into a single opaque
"evidence looks bad" adjustment, the confidence formula computes two
independent penalty terms, each traceable to its own stored component
(`gap_penalty_component`, `conflict_penalty_component` columns). The
gap penalty additionally scales by the hypothesis's own importance rank
— an unresolved gap on a low-importance hypothesis costs less than the
same gap on a critical one — while severity aggregation across
multiple gaps/conflicts of the same tier uses a diminishing-returns
formula (max severity plus a small per-additional-item increment,
capped at 1.0) rather than a linear sum, so five low-severity gaps
don't mathematically outweigh one critical gap.

## 16. Score vs. confidence as structurally distinct axes

**Mechanism:** `src/server/scoring/opportunity-dimension-mapper.ts`
(`scoreDimension`) + `opportunity-score.ts` (`rawScore` vs. `overallScore`).

Every opportunity dimension carries two independently-computed numbers
that answer different questions. `score` ("favorability") is derived
by taking a hypothesis's confidence and *inverting* its contribution
when the underlying evidence leans contradicting rather than
supporting — so high confidence in a negative reading pulls the score
down, not up. `confidence` is a plain average of how much evidence-
backed certainty exists, independent of which direction that evidence
points. The two are aggregated into genuinely different published
numbers (`raw_score` = score-weighted only; `overall_score` = the same
weighting further scaled by each dimension's own confidence), so a
"looks great but we're not sure" business idea and a "we're sure, and
it's mediocre" business idea produce visibly different score/confidence
pairs rather than collapsing to the same single number.

## 17. Gap-to-action traceability with a fixed, category-keyed method table

**Mechanism:** `src/server/validation/validation-action-generator.ts`
(`METHOD_BY_CATEGORY`, `generateCandidatesFromGaps`).

Every candidate validation action is generated from a specific, real
`evidence_gaps` row (`target_gap_id` is a foreign key, not a free-text
reference) and a specific hypothesis, using a fixed lookup table
mapping each of the 12 hypothesis categories to one validation method
with a pre-documented cost/time estimate — never an LLM invention of
"what should I do next." The four ranking input scores
(`businessImpactScore`, `evidenceUncertaintyScore`, `evidenceGapScore`,
`validationCostScore`) are each derived from already-stored data
(hypothesis importance, latest confidence score, gap severity, and the
method's fixed cost tier respectively), so `rankValidationActions()`'s
output is fully reconstructible from data already in the database —
the "why is this the next action" explanation is the literal
arithmetic trail, not a post-hoc rationalization.

## 18. Tool-result cross-checking against model output (anti-fabrication for external research)

**Mechanism:** `src/server/research/web-search-provider.ts`
(`runWebSearchResearch`, the `retrievedUrlSet` cross-check).

When the model is given a live web-search tool and asked to extract
structured claims from what it finds, the naive risk is that its final
JSON summary cites a URL it never actually retrieved (a hallucinated
source). This is addressed structurally, not just by prompt
instruction: every `web_search_tool_result` content block the API
response actually contains is collected into a set of genuinely-
retrieved URLs, and any extraction in the model's final JSON output
citing a URL outside that set is discarded before it ever reaches
persistence — `result.data.extractions.filter((e) => retrievedUrlSet.has(e.sourceUrl))`.
The prompt instructs the model not to do this; the code does not rely
on the model complying.

## 19. Two-tier evidence trust model: data status and review status as independent axes

**Mechanism:** `Evidence.dataStatus` (Phase 1) vs. `Evidence.reviewStatus`
(Phase 6) as two separate columns, both consulted by every
`isCountedEvidence` check across `evidence-gap.service.ts`,
`evidence-conflict.service.ts`, `confidence-engine.ts`, and
`opportunity-dimension-mapper.ts`.

`dataStatus` answers "what kind of evidence is this" (real, user-
provided, demo, mock, unavailable) — a structural, immutable fact set
at creation. `reviewStatus` answers "has a human vetted this specific
item" (pending_review, accepted, rejected, source_unavailable,
extraction_failed) — a mutable state a founder actively changes.
Demo/mock evidence is excluded by `dataStatus` alone, regardless of
`reviewStatus` (nothing a founder does can make demo data count as
real). Real, externally-researched evidence is additionally gated by
`reviewStatus`: even though its `dataStatus` is "real," it does not
count toward any calculation until a human explicitly accepts it. This
two-axis design is what lets the same boolean-style filter function be
reused unmodified everywhere evidence is counted, while still
distinguishing "this is real" from "this is trusted" as genuinely
separate questions.

## 20. Adaptive evidence-driven decision-support architecture (summary)

Taken together, Phases 1-6 implement one continuous, traceable chain:

```
Hypothesis
  ↓
Evidence Requirement
  ↓
Adaptive Research Task
  ↓
Source Retrieval
  ↓
Evidence Extraction
  ↓
Human Verification
  ↓
Evidence Relationship
  ↓
Confidence Update
  ↓
Next Validation
```

Every arrow in this chain is backed by a real foreign-key relationship
or a deterministic function call in the codebase (not an informal
description) — a business idea's final opportunity score and next
recommended action can always be traced back through this exact chain
to the specific evidence rows and human decisions that produced them.
This document uses "adaptive evidence-driven decision-support
architecture" as a plain technical description of what the system
does; it is not a claim that any part of it is patentable, which would
require separate qualified legal review.

## Phase 7 note: productization without distortion

Phase 7 added a commercial/product layer (real dashboard, data-driven
reporting, score history, shareable reports, usage tracking, audit
trail) strictly around the mechanism described above — none of the
nine engines listed in sections 1-17 were modified, and no new
"patent feature" was artificially introduced to this document. The
technical mechanism this document describes is unchanged; only its
presentation to a real, repeat-use entrepreneur changed.
