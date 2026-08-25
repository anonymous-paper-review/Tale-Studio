-- Durable, service-role-only diagnostics for Writer rough-previz decisions.
-- Durable, service-role-only Writer observability events.
begin;

create table public.writer_observability_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.writer_runs(id) on delete cascade,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index writer_observability_events_project_created_idx
  on public.writer_observability_events (project_id, created_at desc);

create index writer_observability_events_run_created_idx
  on public.writer_observability_events (run_id, created_at desc);

create index writer_observability_events_event_created_idx
  on public.writer_observability_events (event, created_at desc);

alter table public.writer_observability_events enable row level security;

commit;
