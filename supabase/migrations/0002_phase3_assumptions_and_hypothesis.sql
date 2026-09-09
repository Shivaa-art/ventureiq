-- =====================================================================
-- VentureIQ — Phase 3 schema additions
--
-- Adds the assumption-extraction stage that sits between idea
-- structuring and hypothesis generation:
--
--   business_ideas (structured)
--     -> business_assumptions   (NEW — this migration)
--     -> hypotheses             (extended: threshold, threshold_type,
--                                 assumption_id, new category set)
--     -> evidence_requirements  (minimum_evidence_level rescaled to
--                                 low/medium/high/critical)
--
-- Also adds explicit per-stage status tracking on business_ideas so the
-- analysis screen can render real pipeline state instead of a fake
-- timer, and a validation-plan approval gate (Step 8's "Approve
-- Validation Plan").
-- =====================================================================

-- ---------------------------------------------------------------------
-- business_assumptions
-- ---------------------------------------------------------------------
create table if not exists public.business_assumptions (
  id uuid primary key default gen_random_uuid(),
  business_idea_id uuid not null references public.business_ideas (id) on delete cascade,

  statement text not null,
  category text not null,
  importance text not null default 'medium' check (importance in ('low', 'medium', 'high', 'critical')),
  source text not null check (source in ('user_provided', 'ai_inferred')),

  status text not null default 'active' check (status in ('active', 'removed')),
  display_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_assumptions_business_idea_id
  on public.business_assumptions (business_idea_id);

drop trigger if exists set_updated_at on public.business_assumptions;
create trigger set_updated_at before update on public.business_assumptions
  for each row execute function public.set_updated_at();

alter table public.business_assumptions enable row level security;

create policy business_assumptions_all_own on public.business_assumptions for all
  using (exists (
    select 1 from public.business_ideas bi
    join public.projects p on p.id = bi.project_id
    where bi.id = business_idea_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.business_ideas bi
    join public.projects p on p.id = bi.project_id
    where bi.id = business_idea_id and p.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------
-- hypotheses: link to source assumption, threshold fields, wider
-- category set (Phase 3 domain-specific categories replace the Phase 1
-- placeholder set).
-- ---------------------------------------------------------------------
alter table public.hypotheses
  add column if not exists assumption_id uuid references public.business_assumptions (id) on delete set null,
  add column if not exists threshold text,
  add column if not exists threshold_type text check (threshold_type in ('ai_proposed', 'user_defined'));

alter table public.hypotheses drop constraint if exists hypotheses_category_check;
alter table public.hypotheses add constraint hypotheses_category_check check (category in (
  'customer_problem', 'market_demand', 'willingness_to_pay', 'competition', 'revenue',
  'profitability', 'scalability', 'operations', 'regulation', 'supply', 'technology', 'go_to_market'
));

create index if not exists idx_hypotheses_assumption_id on public.hypotheses (assumption_id);

-- ---------------------------------------------------------------------
-- evidence_requirements: rescale minimum_evidence_level to the
-- low/medium/high/critical scale specified in Phase 3 (was
-- indicative/moderate/strong/conclusive in the Phase 1 placeholder).
-- ---------------------------------------------------------------------
update public.evidence_requirements set minimum_evidence_level = case minimum_evidence_level
  when 'indicative' then 'low'
  when 'moderate' then 'medium'
  when 'strong' then 'high'
  when 'conclusive' then 'critical'
  else minimum_evidence_level
end;

alter table public.evidence_requirements drop constraint if exists evidence_requirements_minimum_evidence_level_check;
alter table public.evidence_requirements
  add constraint evidence_requirements_minimum_evidence_level_check
  check (minimum_evidence_level in ('low', 'medium', 'high', 'critical'));

-- ---------------------------------------------------------------------
-- business_ideas: per-stage pipeline status + validation-plan approval
-- gate. structuring_status already existed (Phase 1); this adds the
-- three downstream stage statuses plus the human-approval gate.
-- ---------------------------------------------------------------------
alter table public.business_ideas
  add column if not exists assumptions_status text not null default 'pending'
    check (assumptions_status in ('pending', 'processing', 'completed', 'failed')),
  add column if not exists assumptions_error text,
  add column if not exists hypotheses_status text not null default 'pending'
    check (hypotheses_status in ('pending', 'processing', 'completed', 'failed')),
  add column if not exists hypotheses_error text,
  add column if not exists evidence_requirements_status text not null default 'pending'
    check (evidence_requirements_status in ('pending', 'processing', 'completed', 'failed')),
  add column if not exists evidence_requirements_error text,
  add column if not exists plan_status text not null default 'draft'
    check (plan_status in ('draft', 'pending_approval', 'approved')),
  add column if not exists plan_approved_at timestamptz;
