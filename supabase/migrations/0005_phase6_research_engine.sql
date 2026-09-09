-- =====================================================================
-- VentureIQ — Phase 6 schema additions: External Evidence Research
-- Engine.
--
--   research_runs     -> one auditable run of "Research this hypothesis"
--   research_tasks    -> one task per evidence requirement being researched
--   research_queries  -> the actual search queries executed for a task
--   research_sources  -> retrieved source metadata + quality score
--   evidence           -> review_status (human accept/reject gate) +
--                         research_source_id (provenance link back)
-- =====================================================================

-- ---------------------------------------------------------------------
-- research_runs
-- ---------------------------------------------------------------------
create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,

  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  query_count int not null default 0,
  source_count int not null default 0,
  accepted_evidence_count int not null default 0,
  error text,

  created_at timestamptz not null default now()
);

create index if not exists idx_research_runs_hypothesis_id on public.research_runs (hypothesis_id);

-- ---------------------------------------------------------------------
-- research_tasks
-- ---------------------------------------------------------------------
create table if not exists public.research_tasks (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs (id) on delete cascade,
  hypothesis_id uuid not null references public.hypotheses (id) on delete cascade,
  evidence_requirement_id uuid references public.evidence_requirements (id) on delete set null,

  research_question text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_research_tasks_run_id on public.research_tasks (research_run_id);
create index if not exists idx_research_tasks_hypothesis_id on public.research_tasks (hypothesis_id);

-- ---------------------------------------------------------------------
-- research_queries — the LLM may generate candidates, but only the
-- final query the app actually executed is stored, with why.
-- ---------------------------------------------------------------------
create table if not exists public.research_queries (
  id uuid primary key default gen_random_uuid(),
  research_task_id uuid not null references public.research_tasks (id) on delete cascade,

  query text not null,
  reason text not null,

  created_at timestamptz not null default now()
);

create index if not exists idx_research_queries_task_id on public.research_queries (research_task_id);

-- ---------------------------------------------------------------------
-- research_sources
-- ---------------------------------------------------------------------
create table if not exists public.research_sources (
  id uuid primary key default gen_random_uuid(),
  research_task_id uuid not null references public.research_tasks (id) on delete cascade,
  research_query_id uuid references public.research_queries (id) on delete set null,

  source_url text not null,
  source_title text,
  domain text,
  publication_date date,
  retrieval_date timestamptz not null default now(),
  snippet text,
  -- Authority-tier category (Phase 6, Step 5) — distinct from
  -- evidence.source_type (which describes the KIND of evidence, e.g.
  -- "survey", "pricing"). This describes the PUBLISHER's authority tier.
  source_category text not null default 'unknown' check (source_category in (
    'government', 'academic', 'company_filing', 'established_news',
    'industry_organization', 'company_website', 'professional_publication',
    'general_website', 'unknown'
  )),
  source_fingerprint text not null,
  quality_score numeric(5, 2) not null default 0,

  status text not null default 'pending' check (status in ('pending', 'retrieved', 'source_unavailable', 'duplicate')),
  evidence_id uuid references public.evidence (id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists idx_research_sources_task_id on public.research_sources (research_task_id);
create index if not exists idx_research_sources_fingerprint on public.research_sources (source_fingerprint);
create index if not exists idx_research_sources_evidence_id on public.research_sources (evidence_id);

-- ---------------------------------------------------------------------
-- evidence: human-review gate for externally-researched evidence, and
-- a provenance link back to the research source that produced it.
-- Existing evidence (demo/user-provided, all prior phases) defaults to
-- "accepted" so nothing already in the system silently disappears from
-- scoring — only NEW real/externally-researched evidence is inserted
-- with review_status = 'pending_review' going forward (set explicitly
-- by research.service.ts, not by this default).
-- ---------------------------------------------------------------------
alter table public.evidence
  add column if not exists review_status text not null default 'accepted'
    check (review_status in ('pending_review', 'accepted', 'rejected', 'source_unavailable', 'extraction_failed')),
  add column if not exists research_source_id uuid references public.research_sources (id) on delete set null;

create index if not exists idx_evidence_review_status on public.evidence (review_status);

-- ---------------------------------------------------------------------
-- updated_at triggers for the two tables that have the column
-- ---------------------------------------------------------------------
drop trigger if exists set_updated_at on public.research_tasks;
create trigger set_updated_at before update on public.research_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security — same transitive-ownership pattern as every
-- other hypothesis-scoped table.
-- ---------------------------------------------------------------------
alter table public.research_runs enable row level security;
alter table public.research_tasks enable row level security;
alter table public.research_queries enable row level security;
alter table public.research_sources enable row level security;

create policy research_runs_all_own on public.research_runs for all
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

create policy research_tasks_all_own on public.research_tasks for all
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

create policy research_queries_all_own on public.research_queries for all
  using (exists (
    select 1 from public.research_tasks t
    join public.hypotheses h on h.id = t.hypothesis_id
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where t.id = research_task_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.research_tasks t
    join public.hypotheses h on h.id = t.hypothesis_id
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where t.id = research_task_id and p.user_id = auth.uid()
  ));

create policy research_sources_all_own on public.research_sources for all
  using (exists (
    select 1 from public.research_tasks t
    join public.hypotheses h on h.id = t.hypothesis_id
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where t.id = research_task_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.research_tasks t
    join public.hypotheses h on h.id = t.hypothesis_id
    join public.business_ideas bi on bi.id = h.business_idea_id
    join public.projects p on p.id = bi.project_id
    where t.id = research_task_id and p.user_id = auth.uid()
  ));
