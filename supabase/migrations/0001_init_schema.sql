-- =====================================================================
-- VentureIQ — Phase 1 schema
-- Evidence-driven validation pipeline:
-- business_ideas -> hypotheses -> evidence_requirements -> evidence
--   -> evidence_relationships -> evidence_conflicts -> evidence_gaps
--   -> confidence_scores -> opportunity_scores -> validation_actions
--   -> validation_results -> user_decisions
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- users
-- Mirrors auth.users (Supabase Auth). We keep a profile row per user so
-- app-level fields (plan, display name) don't have to live in auth.users.
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- projects
-- The container an entrepreneur creates. One project -> one business idea
-- -> one (or more, over time) analysis runs.
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'analyzing', 'analyzed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_user_id on public.projects (user_id);
create index if not exists idx_projects_status on public.projects (status);

-- ---------------------------------------------------------------------
-- business_ideas
-- Raw founder input AND the structured output produced by the Idea
-- Structuring Engine (Phase 4). Kept separate so raw input is never
-- silently overwritten by model output.
-- ---------------------------------------------------------------------
create table if not exists public.business_ideas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,

  -- raw founder input (verbatim, from the intake form)
  raw_business_name text not null,
  raw_description text not null,
  raw_industry text,
  raw_country text,
  raw_state text,
  raw_city text,
  raw_target_customer text,
  raw_problem text,
  raw_solution text,
  raw_business_model text,
  raw_expected_pricing text,
  raw_estimated_investment text,
  raw_revenue_model text,

  -- structured output (Idea Structuring Engine, Phase 4)
  structured jsonb,               -- StructuredBusinessIdea, zod-validated before write
  structuring_status text not null default 'pending'
    check (structuring_status in ('pending', 'processing', 'completed', 'failed')),
  structuring_model text,         -- e.g. "claude-sonnet-4-6"
  structuring_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_ideas_project_id on public.business_ideas (project_id);

-- ---------------------------------------------------------------------
-- hypotheses
-- Output of the Hypothesis Engine (Phase 5). Status is never set to
-- VALIDATED/INVALIDATED by the LLM directly — only the confidence
-- engine, driven by evidence, may transition status away from UNTESTED.
-- ---------------------------------------------------------------------
create table if not exists public.hypotheses (
  id uuid primary key default gen_random_uuid(),
  business_idea_id uuid not null references public.business_ideas (id) on delete cascade,

  statement text not null,
  category text not null
    check (category in (
      'demand', 'willingness_to_pay', 'competition', 'regulatory',
      'operational', 'channel', 'retention', 'unit_economics', 'other'
    )),
  importance text not null default 'medium' check (importance in ('low', 'medium', 'high', 'critical')),
  validation_criteria text not null,

  status text not null default 'untested'
    check (status in ('untested', 'partially_validated', 'validated', 'contradicted', 'inconclusive')),
  confidence numeric(5, 2) not null default 0 check (confidence >= 0 and confidence <= 100),

  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hypotheses_business_idea_id on public.hypotheses (business_idea_id);
create index if not exists idx_hypotheses_status on public.hypotheses (status);

-- ---------------------------------------------------------------------
-- evidence_requirements
-- Output of the Evidence Requirement Engine (Phase 6). Domain-dependent
-- — generated per hypothesis, not templated globally.
-- ---------------------------------------------------------------------
create table if not exists public.evidence_requirements (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,

  evidence_type text not null,          -- e.g. "competitor_pricing", "customer_survey"
  description text not null,
  importance text not null default 'medium' check (importance in ('low', 'medium', 'high', 'critical')),
  minimum_evidence_level text not null default 'indicative'
    check (minimum_evidence_level in ('indicative', 'moderate', 'strong', 'conclusive')),
  preferred_sources text[] not null default '{}',

  status text not null default 'open' check (status in ('open', 'partially_met', 'met')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_evidence_requirements_hypothesis_id on public.evidence_requirements (hypothesis_id);

-- ---------------------------------------------------------------------
-- evidence
-- Normalized evidence objects (Phase 7). data_status distinguishes real
-- collected evidence from demo/mock/user-provided evidence so the UI can
-- never present synthetic evidence as real.
-- ---------------------------------------------------------------------
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,
  evidence_requirement_id uuid references public.evidence_requirements (id) on delete set null,

  source text not null,
  source_type text not null
    check (source_type in (
      'web_article', 'forum_post', 'review', 'survey', 'government_data',
      'market_report', 'news', 'social_media', 'user_upload', 'expert_input', 'other'
    )),
  source_url text,
  source_title text,
  publication_date date,
  retrieval_date timestamptz not null default now(),

  summary text not null,
  support_direction text not null check (support_direction in ('supports', 'contradicts', 'neutral')),

  reliability_score numeric(5, 2) not null check (reliability_score >= 0 and reliability_score <= 100),
  relevance_score numeric(5, 2) not null check (relevance_score >= 0 and relevance_score <= 100),
  recency_score numeric(5, 2) not null check (recency_score >= 0 and recency_score <= 100),
  independence_score numeric(5, 2) not null check (independence_score >= 0 and independence_score <= 100),
  confidence_score numeric(5, 2) not null check (confidence_score >= 0 and confidence_score <= 100),

  provenance jsonb not null default '{}',   -- how it was collected: provider id, query, raw payload ref
  data_status text not null
    check (data_status in ('real', 'user_provided', 'demo', 'mock', 'unavailable')),

  created_at timestamptz not null default now()
);

create index if not exists idx_evidence_hypothesis_id on public.evidence (hypothesis_id);
create index if not exists idx_evidence_requirement_id on public.evidence (evidence_requirement_id);
create index if not exists idx_evidence_data_status on public.evidence (data_status);
create index if not exists idx_evidence_support_direction on public.evidence (support_direction);

-- ---------------------------------------------------------------------
-- evidence_relationships
-- Explicit graph edges (Phase 9): Business Idea -> Hypothesis -> Evidence,
-- plus evidence-to-evidence relationships (e.g. corroborates/duplicates).
-- ---------------------------------------------------------------------
create table if not exists public.evidence_relationships (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,
  evidence_id uuid not null references public.evidence (id) on delete cascade,
  related_evidence_id uuid references public.evidence (id) on delete cascade,

  relationship_type text not null default 'supports_hypothesis'
    check (relationship_type in (
      'supports_hypothesis', 'contradicts_hypothesis', 'neutral_to_hypothesis',
      'corroborates_evidence', 'duplicates_evidence', 'supersedes_evidence'
    )),

  created_at timestamptz not null default now(),
  unique (hypothesis_id, evidence_id, related_evidence_id, relationship_type)
);

create index if not exists idx_evidence_rel_hypothesis_id on public.evidence_relationships (hypothesis_id);
create index if not exists idx_evidence_rel_evidence_id on public.evidence_relationships (evidence_id);

-- ---------------------------------------------------------------------
-- evidence_conflicts
-- Output of Conflict Detection (Phase 10). Never silently averaged away.
-- ---------------------------------------------------------------------
create table if not exists public.evidence_conflicts (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,

  conflict_type text not null
    check (conflict_type in ('direct_contradiction', 'source_disagreement', 'temporal_shift', 'magnitude_mismatch')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  description text not null,

  supporting_evidence_ids uuid[] not null default '{}',
  contradicting_evidence_ids uuid[] not null default '{}',

  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_evidence_conflicts_hypothesis_id on public.evidence_conflicts (hypothesis_id);

-- ---------------------------------------------------------------------
-- evidence_gaps
-- Output of Gap Detection (Phase 11). A gap is distinct from negative
-- evidence — it means insufficient/no evidence, not contradicting evidence
-- (contradictory_evidence gap type is the exception, tracked separately
-- from evidence_conflicts to drive the "what to validate next" ranking).
-- ---------------------------------------------------------------------
create table if not exists public.evidence_gaps (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,
  evidence_requirement_id uuid references public.evidence_requirements (id) on delete set null,

  gap_type text not null
    check (gap_type in ('no_evidence', 'insufficient_evidence', 'low_confidence_evidence', 'contradictory_evidence')),
  missing_requirement text not null,
  importance text not null default 'medium' check (importance in ('low', 'medium', 'high', 'critical')),
  business_impact text not null,
  recommended_validation text not null,

  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_evidence_gaps_hypothesis_id on public.evidence_gaps (hypothesis_id);

-- ---------------------------------------------------------------------
-- confidence_scores
-- Output of the Confidence Engine (Phase 12). Deterministic, versioned,
-- fully decomposed so "why is confidence 68%?" is always answerable.
-- One row per hypothesis per calculation run.
-- ---------------------------------------------------------------------
create table if not exists public.confidence_scores (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,

  final_confidence numeric(5, 2) not null check (final_confidence >= 0 and final_confidence <= 100),

  -- decomposed inputs, stored so the calculation is reproducible/auditable
  evidence_quality_component numeric(5, 2) not null,
  source_reliability_component numeric(5, 2) not null,
  relevance_component numeric(5, 2) not null,
  recency_component numeric(5, 2) not null,
  independence_component numeric(5, 2) not null,
  supporting_evidence_count int not null default 0,
  contradicting_evidence_count int not null default 0,
  evidence_coverage_pct numeric(5, 2) not null default 0,

  formula_version text not null,        -- e.g. "confidence-v1"
  weights jsonb not null,               -- the exact weights used for this run
  explanation text not null,            -- human-readable "why" derived deterministically

  calculated_at timestamptz not null default now()
);

create index if not exists idx_confidence_scores_hypothesis_id on public.confidence_scores (hypothesis_id);

-- ---------------------------------------------------------------------
-- opportunity_scores
-- Output of the Opportunity Score engine (Phase 13). One row per
-- business_idea per calculation run, with per-dimension breakdown.
-- ---------------------------------------------------------------------
create table if not exists public.opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  business_idea_id uuid not null references public.business_ideas (id) on delete cascade,

  overall_score numeric(5, 2) not null check (overall_score >= 0 and overall_score <= 100),
  overall_confidence numeric(5, 2) not null check (overall_confidence >= 0 and overall_confidence <= 100),

  -- one entry per dimension: market_demand, customer_pain, competition,
  -- revenue_potential, profitability, scalability, investment_feasibility,
  -- operational_complexity, market_timing, regulatory_risk, government_support
  dimensions jsonb not null,
  -- shape per dimension: { score, confidence, reasoning, supporting_evidence_ids,
  --                        contradicting_evidence_ids, recommendation }

  formula_version text not null,
  weights jsonb not null,

  calculated_at timestamptz not null default now()
);

create index if not exists idx_opportunity_scores_business_idea_id on public.opportunity_scores (business_idea_id);

-- ---------------------------------------------------------------------
-- validation_actions
-- Output of the Adaptive Validation Engine (Phase 14): ranked "what to
-- validate next" recommendations with an explicit reasoning trail.
-- ---------------------------------------------------------------------
create table if not exists public.validation_actions (
  id uuid primary key default gen_random_uuid(),
  business_idea_id uuid not null references public.business_ideas (id) on delete cascade,
  hypothesis_id uuid references public.hypotheses (id) on delete set null,

  action_title text not null,
  action_description text not null,
  method text not null,                 -- e.g. "pricing_experiment", "customer_interview"

  business_impact_score numeric(5, 2) not null,
  evidence_uncertainty_score numeric(5, 2) not null,
  evidence_gap_score numeric(5, 2) not null,
  validation_cost_score numeric(5, 2) not null,
  expected_information_value numeric(5, 2) not null,
  priority_rank int not null,

  reasoning text not null,
  status text not null default 'recommended'
    check (status in ('recommended', 'accepted', 'dismissed', 'completed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_validation_actions_business_idea_id on public.validation_actions (business_idea_id);
create index if not exists idx_validation_actions_priority on public.validation_actions (priority_rank);

-- ---------------------------------------------------------------------
-- validation_results
-- Records what happened when a validation_action was actually carried
-- out, and which new evidence rows it produced.
-- ---------------------------------------------------------------------
create table if not exists public.validation_results (
  id uuid primary key default gen_random_uuid(),
  validation_action_id uuid not null references public.validation_actions (id) on delete cascade,

  outcome_summary text not null,
  new_evidence_ids uuid[] not null default '{}',
  affected_hypothesis_ids uuid[] not null default '{}',

  recorded_at timestamptz not null default now()
);

create index if not exists idx_validation_results_action_id on public.validation_results (validation_action_id);

-- ---------------------------------------------------------------------
-- user_decisions
-- The Human Decision step (Phase 15). The system never auto-decides.
-- ---------------------------------------------------------------------
create table if not exists public.user_decisions (
  id uuid primary key default gen_random_uuid(),
  business_idea_id uuid not null references public.business_ideas (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,

  decision text not null check (decision in ('proceed', 'validate_further', 'modify_idea', 'reject')),
  notes text,

  created_at timestamptz not null default now()
);

create index if not exists idx_user_decisions_business_idea_id on public.user_decisions (business_idea_id);

-- ---------------------------------------------------------------------
-- reports
-- A generated, shareable snapshot of a business_idea's full analysis at
-- a point in time (report.$id route reads from here).
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  business_idea_id uuid not null references public.business_ideas (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,

  snapshot jsonb not null,     -- full assembled report payload (idea, hypotheses, evidence,
                                -- conflicts, gaps, confidence, opportunity score, actions, decision)
  is_demo boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists idx_reports_business_idea_id on public.reports (business_idea_id);
create index if not exists idx_reports_user_id on public.reports (user_id);

-- ---------------------------------------------------------------------
-- activity_logs
-- Append-only audit trail of pipeline stage transitions and user actions.
-- ---------------------------------------------------------------------
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,

  event_type text not null,    -- e.g. "hypothesis.generated", "evidence.collected", "decision.recorded"
  payload jsonb not null default '{}',

  created_at timestamptz not null default now()
);

create index if not exists idx_activity_logs_project_id on public.activity_logs (project_id);
create index if not exists idx_activity_logs_user_id on public.activity_logs (user_id);
create index if not exists idx_activity_logs_event_type on public.activity_logs (event_type);

-- =====================================================================
-- updated_at triggers
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'projects', 'business_ideas', 'hypotheses', 'evidence_requirements',
    'evidence_conflicts', 'evidence_gaps', 'validation_actions'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; ' ||
      'create trigger set_updated_at before update on public.%I ' ||
      'for each row execute function public.set_updated_at();', t, t
    );
  end loop;
end $$;

-- =====================================================================
-- Row Level Security
-- Every table is scoped to the owning user, transitively through
-- projects -> business_ideas -> (hypotheses, evidence, ...).
-- All access from the browser goes through the anon key + RLS; the
-- service-role key (server-only) bypasses RLS for pipeline jobs.
-- =====================================================================

alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.business_ideas enable row level security;
alter table public.hypotheses enable row level security;
alter table public.evidence_requirements enable row level security;
alter table public.evidence enable row level security;
alter table public.evidence_relationships enable row level security;
alter table public.evidence_conflicts enable row level security;
alter table public.evidence_gaps enable row level security;
alter table public.confidence_scores enable row level security;
alter table public.opportunity_scores enable row level security;
alter table public.validation_actions enable row level security;
alter table public.validation_results enable row level security;
alter table public.user_decisions enable row level security;
alter table public.reports enable row level security;
alter table public.activity_logs enable row level security;

-- users: a user can read/update only their own profile row
create policy users_select_own on public.users for select using (id = auth.uid());
create policy users_update_own on public.users for update using (id = auth.uid());

-- projects: full CRUD, own rows only
create policy projects_all_own on public.projects for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- business_ideas: scoped via project ownership
create policy business_ideas_all_own on public.business_ideas for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- hypotheses: scoped via business_idea -> project ownership
create policy hypotheses_all_own on public.hypotheses for all
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

-- evidence_requirements: scoped via hypothesis -> business_idea -> project
create policy evidence_requirements_all_own on public.evidence_requirements for all
  using (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ));

-- evidence: scoped via hypothesis -> business_idea -> project
create policy evidence_all_own on public.evidence for all
  using (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ));

-- evidence_relationships: scoped via hypothesis
create policy evidence_relationships_all_own on public.evidence_relationships for all
  using (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ));

-- evidence_conflicts: scoped via hypothesis
create policy evidence_conflicts_all_own on public.evidence_conflicts for all
  using (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ));

-- evidence_gaps: scoped via hypothesis
create policy evidence_gaps_all_own on public.evidence_gaps for all
  using (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ));

-- confidence_scores: scoped via hypothesis
create policy confidence_scores_all_own on public.confidence_scores for all
  using (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.hypotheses h
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where h.id = hypothesis_id and p.user_id = auth.uid()
  ));

-- opportunity_scores: scoped via business_idea -> project
create policy opportunity_scores_all_own on public.opportunity_scores for all
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

-- validation_actions: scoped via business_idea -> project
create policy validation_actions_all_own on public.validation_actions for all
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

-- validation_results: scoped via validation_action -> business_idea -> project
create policy validation_results_all_own on public.validation_results for all
  using (exists (
    select 1 from public.validation_actions va
    join public.business_ideas bi on bi.id = va.business_idea_id
    join public.projects p on p.id = bi.project_id
    where va.id = validation_action_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.validation_actions va
    join public.business_ideas bi on bi.id = va.business_idea_id
    join public.projects p on p.id = bi.project_id
    where va.id = validation_action_id and p.user_id = auth.uid()
  ));

-- user_decisions: own rows only (direct user_id)
create policy user_decisions_all_own on public.user_decisions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports: own rows only (direct user_id)
create policy reports_all_own on public.reports for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- activity_logs: read-only for the owning user; inserts happen via service role
create policy activity_logs_select_own on public.activity_logs for select
  using (user_id = auth.uid());
