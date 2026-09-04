-- 배경의 모습(타임라인) — 약속 C10(2026-09-04): 캐릭터의 character_appearances 와 같은 축을 배경에도 둔다.
--   기본 모습은 locations 행 자체(visual_description·wide_shot, 키 'default')이고, 이 표는 과거/현재/미래 변형만 담는다.
--   Writer/Director 는 씬의 narrative_time 과 맞는 변형이 있고 이미지가 있으면 그것을, 아니면 locations 의 기본을 읽는다.
create table if not exists public.location_appearances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  location_id text not null,
  appearance_key text not null,
  label text not null,
  narrative_time text check (narrative_time in ('past', 'present', 'future')),
  visual_description text,
  visual_description_native text,
  i18n_provenance jsonb not null default '{}'::jsonb,
  wide_shot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_appearances_key_unique unique (project_id, location_id, appearance_key)
);
create index if not exists location_appearances_location_idx
  on public.location_appearances (project_id, location_id);

alter table public.location_appearances enable row level security;
drop policy if exists "Owner select" on public.location_appearances;
create policy "Owner select" on public.location_appearances
  for select
  using (
    project_id in (
      select p.id
      from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  );
-- 쓰기는 service_role(라우트·finalize) 전용 — 브라우저는 읽기만 한다.
