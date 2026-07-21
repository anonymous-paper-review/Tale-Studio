begin;

alter table public.shots add column if not exists static_spec jsonb;
alter table public.shots add column if not exists prompt_source_hash text;

commit;
