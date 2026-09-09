-- =====================================================================
-- VentureIQ — Phase 6 cleanup: add "flagged" as a persisted evidence
-- review status, alongside pending_review/accepted/rejected/
-- source_unavailable/extraction_failed.
--
-- Flagged evidence is human-reviewed but deliberately left unresolved
-- (neither accepted nor rejected) — it must remain visible for later
-- Accept/Reject, and must NOT participate in confidence/opportunity
-- scoring (enforced in application code: isCountedEvidence checks
-- require review_status = 'accepted' specifically, so 'flagged' is
-- excluded exactly like 'pending_review' without any additional
-- application change).
-- =====================================================================

alter table public.evidence drop constraint if exists evidence_review_status_check;
alter table public.evidence add constraint evidence_review_status_check check (review_status in (
  'pending_review', 'accepted', 'rejected', 'flagged', 'source_unavailable', 'extraction_failed'
));
