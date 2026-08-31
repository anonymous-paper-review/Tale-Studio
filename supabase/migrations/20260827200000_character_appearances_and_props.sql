-- G4: 캐릭터의 시간축(모습)과 사물 축(소품)을 가른다.
--
-- 왜:
--   1) "젊은 옥화"가 옥화와 무관한 별도 캐릭터로 앉아 있어 얼굴 연속성이 없다(실측: 같은
--      프로젝트에 char_3 옥화 / char_new_9l6xq 젊은 옥화, 시트 두 장의 얼굴 골격이 다름).
--      시트 생성이 참조할 수 있는 건 "자기 자신의 view_main" 뿐이라 구조적으로 이어질 수 없다.
--   2) 사물(엿판·옥비녀)이 characters 에 살아서 character_blocking 에 섞여 들어가고,
--      "얼굴 없는 인물"로 그려진다(#object-not-figure, '엿판이 안긴 아기로' 실사고).
--      지금 방어는 뒤늦게 걸러내는 것이라 한 겹만 빠져도 재발한다(2026-08-27 실제 발생).
--
-- 이 마이그레이션은 구조만 만든다. 데이터 이관은 다음 마이그레이션에서 한다
--   (기존 코드가 아직 characters 를 읽으므로 한 번에 옮기면 화면이 깨진다).
--
-- 키 설계 메모: 코드는 캐릭터를 character_id(문자열)로만 찾는다(실측: character_id 조회 11곳,
--   id(uuid) 조회 0곳). 샷도 characters 배열에 문자열 id 를 담는다. 그래서 FK 를
--   (project_id, character_id) 복합키에 건다 — uuid 로 걸면 코드가 매번 uuid 를 되찾아야 한다.

begin;

-- ── 0. characters 의 복합 유니크 (FK 대상이 되려면 필수) ──
-- 실측: 167행에서 (project_id, character_id) 중복 0건이라 그대로 걸린다.
alter table public.characters
  add constraint characters_project_character_key unique (project_id, character_id);

-- ── 1. 소품(사물) — characters 에서 분리 ──
create table public.props (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- 프로젝트 안에서 사람이 읽는 키. characters.character_id 와 같은 성격.
  prop_id text not null,
  name text not null,
  description text,
  -- 사물의 생김새(프롬프트 입력). characters.appearance 와 같은 역할.
  appearance text,
  appearance_native text,
  -- 대표 이미지 1장. 사람과 달리 4방향 시트가 필요 없다(단일 포트레이트, #7).
  image_url text,
  -- 이미지 계보 추적 — characters 와 같은 규약.
  source_hash text,
  origin text not null default 'writer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint props_project_prop_key unique (project_id, prop_id),
  -- 빈 키/이름은 조인과 프롬프트를 조용히 깨뜨린다. 입구에서 막는다.
  constraint props_prop_id_not_blank check (btrim(prop_id) <> ''),
  constraint props_name_not_blank check (btrim(name) <> ''),
  constraint props_origin_valid check (origin in ('writer', 'producer', 'user'))
);

-- FK 컬럼은 Postgres 가 자동으로 인덱스를 만들지 않는다. 프로젝트 단위 조회가 기본 경로다.
create index props_project_idx on public.props (project_id);

-- ── 2. 모습(캐릭터의 시점·의상 변형) ──
-- 옥화(캐릭터) ─┬─ 현재 (기본)
--               └─ 젊은 시절   ← 옥화의 얼굴을 참조로 생성 = 연속성
create table public.character_appearances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- 어느 캐릭터의 모습인가. 캐릭터가 지워지면 그 모습들도 함께 지운다.
  character_id text not null,
  -- 프로젝트 안에서 사람이 읽는 키. 예: 'current', 'young'
  appearance_key text not null,
  -- 화면에 보이는 이름. 예: '현재', '젊은 시절'
  label text not null,

  -- 이 모습이 그 캐릭터의 기본인가. 캐릭터당 정확히 하나만 true (아래 부분 유니크).
  is_default boolean not null default false,

  -- 서사 시점 — 플래시백 씬이 자동으로 고를 근거.
  --   씬의 time_of_day(하루 중 시각, 조명용)와는 다른 축이다. 거기 욱여넣으면 조명이 오염된다.
  era text,

  -- 이 모습의 생김새(프롬프트 입력). 캐릭터 기본 외형을 덮어쓴다.
  appearance text,
  appearance_native text,
  costume text[],

  -- 이미지 두 칸만 물려받는다.
  --   sheet_url  = 템플릿 시트 1장 (기존 characters.view_main 과 같은 성격 — 이름을 실체에 맞춤)
  --   portrait_url = 그 시트에서 크롭한 얼굴 (기존 characters.portrait)
  --   옛 view_side_left/right/back 은 물려받지 않는다 — 최근 45행에서 0%인 잔재다.
  sheet_url text,
  portrait_url text,

  -- 이 모습을 만들 때 무엇을 참조로 넣었는가. 연속성의 근거를 남긴다.
  --   예: 젊은 옥화 = 옥화의 portrait 를 참조 → 그 URL 을 여기 남긴다.
  derived_from_url text,

  source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 같은 캐릭터에 같은 키의 모습이 둘일 수 없다.
  constraint character_appearances_key_unique
    unique (project_id, character_id, appearance_key),
  -- 캐릭터가 실제로 존재해야 한다. 캐릭터 삭제 시 모습도 함께 사라진다.
  constraint character_appearances_character_fk
    foreign key (project_id, character_id)
    references public.characters (project_id, character_id)
    on delete cascade,
  constraint character_appearances_key_not_blank check (btrim(appearance_key) <> ''),
  constraint character_appearances_label_not_blank check (btrim(label) <> '')
);

-- 캐릭터별 모습 목록 조회가 기본 경로.
create index character_appearances_character_idx
  on public.character_appearances (project_id, character_id);

-- 기본 모습은 캐릭터당 정확히 하나.
--   부분 유니크 인덱스라 is_default=false 인 행은 몇 개든 허용된다.
create unique index character_appearances_one_default_idx
  on public.character_appearances (project_id, character_id)
  where is_default;

-- 플래시백 씬이 시점으로 모습을 고를 때 쓴다.
create index character_appearances_era_idx
  on public.character_appearances (project_id, era)
  where era is not null;

-- ── 3. updated_at 자동 갱신 ──
-- 손으로 넣으면 반드시 빠뜨린다. 트리거로 고정한다.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger props_touch_updated_at
  before update on public.props
  for each row execute function public.touch_updated_at();

create trigger character_appearances_touch_updated_at
  before update on public.character_appearances
  for each row execute function public.touch_updated_at();

-- ── 4. RLS + 정책 ──
-- 저장소 규약(.claude/rules/supabase.md): "새 테이블과 policy를 함께 만든다".
--
-- 이 두 테이블은 characters 와 같은 자리에 선다 — 클라(artist-store·asset-storage-store·
--   producer-store·writer-store)가 anon 키로 직접 SELECT 한다. 그래서 소유자 체인
--   SELECT 정책이 필요하다. character_image_candidates 와 동일한 형태다.
--
-- 쓰기(insert/update/delete)는 service-role 라우트 전용이므로 정책을 열지 않는다.
--   service_role 은 RLS 를 우회하므로 별도 정책 없이 동작한다.
alter table public.props enable row level security;
alter table public.character_appearances enable row level security;

create policy "Owner select" on public.props
  for select
  using (
    project_id in (
      select p.id
      from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  );

create policy "Owner select" on public.character_appearances
  for select
  using (
    project_id in (
      select p.id
      from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  );

commit;
