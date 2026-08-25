-- Reference-import POC schema (G003, 2026-08-25).
-- The workspace plan is a temporary v4 shape until billing integration owns plan data.
begin;

alter table public.projects
  add column if not exists reference_project_id uuid;

alter table public.projects
  add column if not exists optional_reference_frame_url text;

comment on column public.projects.optional_reference_frame_url is
  'Optional copied last-shot start frame for reference-import POC; ownership and copying are added by G004.';

-- Keep the reference dangling-safe when its source project is deleted.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_reference_project_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_reference_project_id_fkey
      foreign key (reference_project_id)
      references public.projects(id)
      on delete set null;
  end if;
end $$;

create index if not exists projects_reference_project_id_idx
  on public.projects(reference_project_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_reference_project_not_self_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_reference_project_not_self_check
      check (reference_project_id is null or reference_project_id <> id);
  end if;
end $$;

alter table public.workspaces
  add column if not exists plan text not null default 'free';

comment on column public.workspaces.plan is
  'Temporary v4 plan key for project slot gating; billing integration will own this value later.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspaces_plan_v4_check'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_plan_v4_check
      check (plan in ('free', 's1', 's2', 's5', 's10', 'p10', 'p15', 'p20', 'p25', 'p30'));
  end if;
end $$;

commit;
