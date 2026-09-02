-- 서버 500 무흔적 해소(#C, 2026-09-02 observability-audit) — instrumentation.ts onRequestError 가
--   기록하는 유일한 대상. RLS 는 켜되 정책은 없다(service-role 전용, deny-all — writer_observability_events
--   와 같은 규약).
begin;

create table public.server_errors (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  method text not null,
  message text not null,
  stack text,
  created_at timestamptz not null default now()
);

create index server_errors_created_at_idx on public.server_errors (created_at desc);

alter table public.server_errors enable row level security;

commit;
