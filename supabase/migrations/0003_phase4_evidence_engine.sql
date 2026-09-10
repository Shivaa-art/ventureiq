-- =====================================================================
-- VentureIQ — Phase 4 schema additions: Evidence Engine
--
--   evidence            -> evidence_type rescaled to Phase 4's category
--                          list; adds notes + classification_reason
--   evidence_relationships -> adds classification_confidence + reason
--   evidence_gaps        -> gap_type: low_confidence_evidence renamed
--                          to low_quality_evidence; severity gains 'critical'
--   evidence_conflicts   -> status: acknowledged renamed to reviewed;
--                          severity gains 'critical'
-- =====================================================================

-- ---------------------------------------------------------------------
-- evidence: rescale source_type to Phase 4's evidence-type list (the
-- Phase 1 placeholder list — web_article/forum_post/... — is replaced
-- outright since Phase 4 is the first phase to actually write real
-- evidence rows; there is no existing data to migrate).
-- ---------------------------------------------------------------------
alter table public.evidence drop constraint if exists evidence_source_type_check;
alter table public.evidence add constraint evidence_source_type_check check (source_type in (
  'customer_feedback', 'survey', 'interview', 'competitor', 'market_data',
  'pricing', 'financial', 'regulatory', 'government', 'experiment', 'other'
));

alter table public.evidence
  add column if not exists notes text,
  add column if not exists classification_reason text;

-- ---------------------------------------------------------------------
-- evidence_relationships: classifier output (confidence + reason)
-- alongside the existing relationship_type.
-- ---------------------------------------------------------------------
alter table public.evidence_relationships
  add column if not exists classification_confidence numeric(5, 2)
    check (classification_confidence is null or (classification_confidence >= 0 and classification_confidence <= 100)),
  add column if not exists reason text;

-- ---------------------------------------------------------------------
-- evidence_gaps: align gap_type naming with Phase 4 spec; widen
-- severity to include 'critical' so severity can reflect hypothesis
-- importance properly (not every gap is created equal).
-- ---------------------------------------------------------------------
update public.evidence_gaps set gap_type = 'low_quality_evidence' where gap_type = 'low_confidence_evidence';

alter table public.evidence_gaps drop constraint if exists evidence_gaps_gap_type_check;
alter table public.evidence_gaps add constraint evidence_gaps_gap_type_check check (gap_type in (
  'no_evidence', 'insufficient_evidence', 'low_quality_evidence', 'contradictory_evidence'
));

alter table public.evidence_gaps drop constraint if exists evidence_gaps_severity_check;

alter table public.evidence_gaps
  add column if not exists severity text;

update public.evidence_gaps
set severity = importance
where severity is null;

alter table public.evidence_gaps
  alter column severity set not null;

alter table public.evidence_gaps
  add constraint evidence_gaps_severity_check
  check (severity in ('low', 'medium', 'high', 'critical'));

-- ---------------------------------------------------------------------
-- evidence_conflicts: align status naming (acknowledged -> reviewed)
-- and widen severity to include 'critical'.
-- ---------------------------------------------------------------------
update public.evidence_conflicts set status = 'reviewed' where status = 'acknowledged';

alter table public.evidence_conflicts drop constraint if exists evidence_conflicts_status_check;
alter table public.evidence_conflicts add constraint evidence_conflicts_status_check
  check (status in ('open', 'reviewed', 'resolved'));

alter table public.evidence_conflicts drop constraint if exists evidence_conflicts_severity_check;
alter table public.evidence_conflicts add constraint evidence_conflicts_severity_check
  check (severity in ('low', 'medium', 'high', 'critical'));

-- ---------------------------------------------------------------------
-- Track which gaps/conflicts were system-generated (and thus safe to
-- replace wholesale on re-evaluation) vs. touched by a human (status
-- moved to reviewed/resolved, or a note added) — re-evaluation must
-- never silently discard a founder's review of a conflict.
-- ---------------------------------------------------------------------
alter table public.evidence_gaps
  add column if not exists auto_generated boolean not null default true;
alter table public.evidence_gaps
  drop constraint if exists evidence_gaps_severity_check2;
alter table public.evidence_gaps
  add constraint evidence_gaps_severity_check2
  check (severity in ('low', 'medium', 'high', 'critical'));
alter table public.evidence_conflicts
  add column if not exists auto_generated boolean not null default true;
