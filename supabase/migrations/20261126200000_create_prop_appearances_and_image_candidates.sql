-- 소품 모습 · 소품 지난 그림(m1126, 오너 2026-11-26 "소품 모습 추가 버튼 만들기" A3 · "Artist 호버링하면 과거 이력 아래에 뜨기" A4).
--   리드 승인 2026-11-26(R3): 새 표 둘을 한 파일에 — 기존 표에는 칸을 더하지 않는다(늘리기만 하는 1단계, 옛 코드는 이 표를 모른 채 그대로 돈다).
--
--   (1) prop_appearances — 배경 모습(location_appearances, 약속 C10)과 같은 모양. 기본 모습은 props 행 자체(키 'default')이고
--       이 표는 과거 · 현재 · 미래 같은 다른 모습만 담는다. 샷의 실사 참고는 씬의 이야기 속 때(narrative_time)와 같은 모습 중
--       그림이 있는 첫 것을, 없으면 props 행의 기본 그림을 쓴다(배경과 같은 규칙).
--       소품을 지우면 그 모습도 함께 지운다(props 에 대한 외래 키 cascade — 배경 모습에는 없던 것).
--   (2) prop_image_candidates — 인물 · 배경 후보 표(character_image_candidates · location_image_candidates)와 같은 모양의 소품 그림 기록.
--       칸 = (소품, 모습 열쇠). 그릴 때마다 새 선택본 한 줄, 안 고른 것은 칸마다 최근 5장(CANDIDATE_RETENTION)만 남긴다(fal/finalize.ts).
--       모습 열쇠는 비우지 않는다 — 기본 모습은 'default'(배경의 variant_key null 대신) — 그래야 "칸마다 선택본 하나" 색인이 기본 모습에도 걸린다.
--       소품은 그림 한 장이라 인물 · 배경의 view 칸은 두지 않는다.
--
--   쓰기는 서버(service role)만 — 화면은 인물 · 배경 후보처럼 소유자 SELECT 정책으로 읽는다.
--   약속: tests/artist/prop-appearances.test.ts · tests/artist/prop-image.test.ts(후보 기록)
--   되돌리기: supabase/rollbacks/20261126200000_create_prop_appearances_and_image_candidates.rollback.sql(이 폴더 밖 — 이 폴더의 .sql 은 모두 마이그레이션으로 실행된다).
begin;

-- ── 1. 소품 모습 ──
create table if not exists public.prop_appearances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prop_id text not null,
  -- 프로젝트 · 소품 안에서 사람이 읽는 열쇠(예: 'broken'). 'default' 는 props 행(기본 모습) 몫이라 쓰지 않는다.
  appearance_key text not null,
  -- 화면에 보이는 이름(예: '부러진 칼').
  label text not null,
  narrative_time text check (narrative_time in ('past', 'present', 'future')),
  -- 이 모습의 생김새 — 영어 base(그림 지시문 입력) · 화면 말(native). props.appearance 와 같은 역할.
  appearance text,
  appearance_native text,
  i18n_provenance jsonb not null default '{}'::jsonb,
  -- 이 모습의 그림 한 장(소품 양식 16:9)과 그 그림의 지문(props.source_hash 와 같은 규약).
  image_url text,
  source_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prop_appearances_key_unique unique (project_id, prop_id, appearance_key),
  constraint prop_appearances_key_not_default check (appearance_key <> 'default'),
  constraint prop_appearances_key_not_blank check (btrim(appearance_key) <> ''),
  constraint prop_appearances_label_not_blank check (btrim(label) <> ''),
  constraint prop_appearances_prop_fk foreign key (project_id, prop_id)
    references public.props (project_id, prop_id) on delete cascade
);
create index if not exists prop_appearances_prop_idx
  on public.prop_appearances (project_id, prop_id);

create trigger prop_appearances_touch_updated_at
  before update on public.prop_appearances
  for each row execute function public.touch_updated_at();

comment on table public.prop_appearances is
  '소품의 다른 모습(2026-11-26 A3): 기본 모습은 props 행, 이 표는 다른 모습만. 샷은 씬의 이야기 속 때와 같은 모습 중 그림이 있는 첫 것을 참고한다. 서버만 쓴다.';

-- ── 2. 소품 지난 그림 ──
create table if not exists public.prop_image_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prop_id text not null,
  -- 'default' = props 행(기본 모습), 그 밖 = prop_appearances.appearance_key.
  appearance_key text not null default 'default',
  url text not null,
  source_hash text,
  appearance_hash text,
  job_id uuid references public.generation_jobs(id) on delete set null,
  is_selected boolean not null default false,
  pinned boolean not null default false,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint prop_image_candidates_prop_fk foreign key (project_id, prop_id)
    references public.props (project_id, prop_id) on delete cascade
);

-- 칸(소품 × 모습)마다 지금 그림(선택본)은 하나.
create unique index if not exists idx_prop_img_candidates_one_selected
  on public.prop_image_candidates (project_id, prop_id, appearance_key)
  where is_selected;
-- 마무리의 선택 해제 · 넣기 · 안 고른 것 정리, 화면의 칸별 기록 읽기가 모두 이 칸으로 찾는다.
create index if not exists idx_prop_img_candidates_slot
  on public.prop_image_candidates (project_id, prop_id, appearance_key, generated_at desc);

comment on table public.prop_image_candidates is
  '소품 그림 기록(2026-11-26 A4): 인물 · 배경 후보 표와 같은 규칙 — 칸(소품 × 모습)마다 선택본 하나 + 안 고른 것 최근 5장. 서버만 쓴다.';

-- ── 3. RLS + 정책(저장소 규약: 새 표와 정책을 함께) ──
--   화면(artist-store)이 anon 키 + 세션으로 직접 읽는다 — props · location_appearances 와 같은 소유자 체인 SELECT 정책.
--   쓰기(insert/update/delete)는 service-role 라우트 · 마무리 전용이라 정책을 열지 않는다.
alter table public.prop_appearances enable row level security;
alter table public.prop_image_candidates enable row level security;

drop policy if exists "Owner select" on public.prop_appearances;
create policy "Owner select" on public.prop_appearances
  for select
  using (
    project_id in (
      select p.id
      from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  );

drop policy if exists "Owner select" on public.prop_image_candidates;
create policy "Owner select" on public.prop_image_candidates
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
