begin;

alter table public.generation_jobs add column if not exists response_snapshot jsonb;

commit;
