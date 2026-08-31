begin;

-- ChatTrace is a compact, prompt-free receipt for one chat request.
-- Raw prompts, attachments, and provider result URLs do not belong here.
create table if not exists public.chat_traces (
  trace_id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  stage text not null,
  route text not null,
  model text not null default 'unknown',
  duration_ms integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  stop_reason text,
  history_count integer not null default 0,
  history_chars integer not null default 0,
  context_chars integer not null default 0,
  prompt_chars integer not null default 0,
  parse_status text,
  raw_update_count integer,
  valid_update_count integer,
  applied_count integer,
  skipped_count integer,
  pending_proposal boolean,
  choices_marker_found boolean,
  choices_count integer,
  generation_http_status integer,
  generation_status text,
  request_status integer,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_traces_project_created_idx
  on public.chat_traces (project_id, created_at desc);

alter table public.chat_traces enable row level security;

alter table public.generation_jobs
  add column if not exists chat_trace_id uuid
  references public.chat_traces(trace_id)
  on delete set null;

create index if not exists generation_jobs_chat_trace_idx
  on public.generation_jobs (chat_trace_id, created_at);

commit;
