-- =====================================================================
-- VentureIQ — Phase 7 schema additions: Commercial Productization.
--
--   activity_logs  -> entity_type, entity_id (structured audit queries)
--   business_ideas -> share_token, share_enabled (shareable report link)
--   users          -> subscription_status, subscription_provider,
--                     subscription_id (subscription-ready, no payment
--                     integration yet)
--
-- Deliberately NOT added: a stored, mutable "project status" enum or a
-- separate usage-counter table. Project status (DRAFT/VALIDATION_PLAN/
-- RESEARCHING/REVIEW/READY_FOR_DECISION/COMPLETED/FAILED) is derived
-- on read from existing pipeline/plan/evidence/decision state
-- (src/server/services/project-status.ts), and usage is counted live
-- from existing rows (src/server/services/usage.service.ts) — both to
-- avoid a second, mutable source of truth that could drift from the
-- data that actually defines it.
-- =====================================================================

alter table public.activity_logs
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

create index if not exists idx_activity_logs_entity on public.activity_logs (entity_type, entity_id);

alter table public.business_ideas
  add column if not exists share_token text,
  add column if not exists share_enabled boolean not null default false;

create unique index if not exists idx_business_ideas_share_token
  on public.business_ideas (share_token) where share_token is not null;

alter table public.users
  add column if not exists subscription_status text not null default 'active'
    check (subscription_status in ('active', 'past_due', 'canceled', 'trialing')),
  add column if not exists subscription_provider text,
  add column if not exists subscription_id text;
