-- G4: 서사 시점은 조명용 time_of_day와 별도 축으로 유지한다.

begin;

-- character_appearances의 기존 era는 명확한 세 값의 서사 시점으로 이름과 계약을 고정한다.
alter table public.character_appearances
  rename column era to narrative_time;

drop index public.character_appearances_era_idx;

update public.character_appearances
set narrative_time = 'present'
where is_default
  and narrative_time is null;

alter table public.character_appearances
  add constraint character_appearances_narrative_time_valid
    check (narrative_time is null or narrative_time in ('present', 'past', 'future')),
  add constraint character_appearances_default_narrative_time_required
    check (not is_default or narrative_time is not null);

create index character_appearances_narrative_time_idx
  on public.character_appearances (project_id, narrative_time)
  where narrative_time is not null;

-- 각 씬은 고정된 story present 기준의 서사 시점을 갖는다. time_of_day는 건드리지 않는다.
alter table public.scenes
  add column narrative_time text;

update public.scenes
set narrative_time = 'present'
where narrative_time is null;

alter table public.scenes
  alter column narrative_time set not null,
  add constraint scenes_narrative_time_valid
    check (narrative_time in ('present', 'past', 'future'));

-- 장면 별 모습 강제 선택. scene_id는 프로젝트 안에서만 의미가 있으므로 복합키를 FK 대상으로 쓴다.
-- 장면 별 모습 강제 선택. scene_id는 프로젝트 안에서만 의미가 있으므로 기존
-- scenes_project_id_scene_id_key 복합 유니크 제약을 FK 대상으로 쓴다.

create table public.scene_character_appearance_overrides (
  project_id uuid not null,
  scene_id text not null,
  character_id text not null,
  appearance_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint scene_character_appearance_overrides_pkey
    primary key (project_id, scene_id, character_id),
  constraint scene_character_appearance_overrides_scene_fk
    foreign key (project_id, scene_id)
    references public.scenes (project_id, scene_id)
    on delete cascade,
  constraint scene_character_appearance_overrides_appearance_fk
    foreign key (project_id, character_id, appearance_key)
    references public.character_appearances (project_id, character_id, appearance_key)
    on delete restrict
);

-- 기본키는 scene FK 조회를 덮고, 모습 FK는 별도 인덱스로 보장한다.
create index scene_character_appearance_overrides_appearance_idx
  on public.scene_character_appearance_overrides (project_id, character_id, appearance_key);

create trigger scene_character_appearance_overrides_touch_updated_at
  before update on public.scene_character_appearance_overrides
  for each row execute function public.touch_updated_at();

alter table public.scene_character_appearance_overrides enable row level security;

create policy "Owner select" on public.scene_character_appearance_overrides
  for select
  using (
    project_id in (
      select p.id
      from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  );

-- 샷은 당시 선택된 모습을 객체 스냅샷으로 갖는다. 기존 캐릭터는 모두 기본 current 모습이다.
alter table public.shots
  add column character_appearance_keys jsonb;

update public.shots s
set character_appearance_keys = (
  select coalesce(jsonb_object_agg(character_id, 'current'::text), '{}'::jsonb)
  from unnest(coalesce(s.characters, '{}'::text[])) as character_id
)
where character_appearance_keys is null;

alter table public.shots
  alter column character_appearance_keys set not null,
  add constraint shots_character_appearance_keys_object
    check (jsonb_typeof(character_appearance_keys) = 'object');

commit;
