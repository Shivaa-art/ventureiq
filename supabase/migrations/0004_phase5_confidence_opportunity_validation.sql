-- =====================================================================
-- VentureIQ — Phase 5 schema additions: Confidence, Opportunity,
-- Adaptive Validation, Human Decision.
--
--   evidence            -> source_fingerprint (independence dedup)
--   confidence_scores   -> confidence_level, supporting/contradicting
--                          factor summaries, gap/conflict penalty components
--   opportunity_scores  -> raw_score (vs. overall_score = confidence-adjusted)
--   validation_actions  -> target_gap_id, estimated_cost, estimated_time,
--                          priority (CRITICAL/HIGH/MEDIUM/LOW)
--   user_decisions      -> decision_basis
-- =====================================================================

-- ---------------------------------------------------------------------
-- evidence: source fingerprint for independence deduplication (Phase 5,
-- Step 3). Two items sharing a fingerprint are treated as originating
-- from the same underlying source and are collapsed to one independent
-- data point by the confidence engine, rather than counted twice.
-- ---------------------------------------------------------------------
alter table public.evidence
  add column if not exists source_fingerprint text;

create index if not exists idx_evidence_source_fingerprint on public.evidence (source_fingerprint);

-- ---------------------------------------------------------------------
-- confidence_scores: explainability fields + explicit gap/conflict
-- penalty components (confidence-v2 formula).
-- ---------------------------------------------------------------------
alter table public.confidence_scores
  add column if not exists confidence_level text
    check (confidence_level in ('very_low', 'low', 'medium', 'high', 'very_high')),
  add column if not exists supporting_factor_summary text,
  add column if not exists contradicting_factor_summary text,
  add column if not exists gap_penalty_component numeric(5, 2) not null default 0,
  add column if not exists conflict_penalty_component numeric(5, 2) not null default 0,
  add column if not exists independent_evidence_count int not null default 0;

-- ---------------------------------------------------------------------
-- opportunity_scores: raw (evidence-confidence-agnostic) score
-- alongside the existing overall_score, which becomes the
-- confidence-adjusted figure (opportunity-v2 formula).
-- ---------------------------------------------------------------------
alter table public.opportunity_scores
  add column if not exists raw_score numeric(5, 2);

update public.opportunity_scores set raw_score = overall_score where raw_score is null;
alter table public.opportunity_scores alter column raw_score set not null;

-- ---------------------------------------------------------------------
-- validation_actions: link to the specific gap that motivated the
-- action, human-readable cost/time estimates, and a discrete priority
-- tier alongside the existing continuous priority_rank.
-- ---------------------------------------------------------------------
alter table public.validation_actions
  add column if not exists target_gap_id uuid references public.evidence_gaps (id) on delete set null,
  add column if not exists estimated_cost text,
  add column if not exists estimated_time text,
  add column if not exists priority text
    check (priority in ('critical', 'high', 'medium', 'low'));

update public.validation_actions set priority = 'medium' where priority is null;
alter table public.validation_actions alter column priority set not null;

create index if not exists idx_validation_actions_target_gap_id on public.validation_actions (target_gap_id);

-- ---------------------------------------------------------------------
-- user_decisions: what the decision was based on, in the founder's
-- own words (distinct from the free-form `notes` field, which is more
-- general commentary).
-- ---------------------------------------------------------------------
alter table public.user_decisions
  add column if not exists decision_basis text;
