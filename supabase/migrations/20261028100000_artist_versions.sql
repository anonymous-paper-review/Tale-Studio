-- 작품 스타일 기록(2026-10-28 오너, 프로토타입 A5 · A6 · AV · AY): Artist [재생성하기]는 지금 버전을 기록에 남기고 새 버전(v{n+1})을 연다.
--   버전 하나 = 작품 스타일 하나 + 그때의 그림(인물 모습별 시트 · 대표 얼굴, 배경 모습별 그림). [불러오기]는 다시 그리지 않고 그 버전으로 돌린다.
--   지금 버전(is_current)은 카드마다 고친 그림을 따라가고, 떠날 때(재생성 · 불러오기) 그림을 버전 폴더({ws}/{project}/versions/v{n}/)에
--   복사해 snapshot 에 남긴다. active = 그 버전이 지금이었던 때들({from,to}) — 카드 기록의 그림이 어느 버전(스타일) 것인지 그린 때로 가린다.
--   regen = 재생성 그림 그리기(시작 시각 · 그릴 칸 · 접수 전에 막힌 칸 · 다 그린 때 · 그만둔 때 · 재생성 전 버전) — 화면을 떠났다 돌아오면 남은 칸을 이어 그린다.
--   오너 결정(4): 새 표 하나만 더하고 기존 표에는 칸을 더하지 않는다. 서버(service role)만 읽고 쓴다 — 화면은 /api/artist/versions 로 읽는다.
--   약속: tests/artist/style-version-routes.test.ts · tests/artist/style-versions.test.ts · tests/ops/artist-versions-migration.test.ts
--   되돌리기: supabase/rollbacks/20261028100000_artist_versions.rollback.sql(이 폴더 밖 — 이 폴더의 .sql 은 모두 마이그레이션으로 실행된다).
begin;

create table public.artist_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  n integer not null check (n >= 1),
  style_anchor_key text,
  -- 그 버전이 직접 올린 그림체(custom_<uuid>)였으면 그 그림체 자체를 복사해 둔다 — 다른 스타일로 바꾸면 projects 에서 지워진다.
  custom_style_anchor jsonb,
  -- 떠날 때 남긴 그림: { characters: [{ characterId, appearanceKey, sheet: { url, candidateId, sourceHash, appearanceHash, generatedAt, sourceUrl }, portraitUrl, portraitSourceUrl }],
  --   locations: [{ locationId, appearanceKey(null = 기본 모습), wideShot: { … } }], look: { l1 } }. 지금 버전은 null 일 수 있다(지금 그림이 곧 그 버전).
  --   불러오는 동안은 restoring: { at, until } 표시가 붙는다(다 되돌리면 뗀다).
  snapshot jsonb,
  is_current boolean not null default false,
  active jsonb not null default '[]'::jsonb,
  regen jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_versions_project_n_key unique (project_id, n)
);

-- 프로젝트마다 지금 버전은 하나 — 두 창이 같이 바꿔도 둘이 되지 않는다.
create unique index artist_versions_one_current on public.artist_versions (project_id) where is_current;

comment on table public.artist_versions is
  '작품 스타일 기록(2026-10-28): 버전 = 작품 스타일 + 그때의 그림. 재생성은 지금 버전을 남기고 새 버전을 열고, 불러오기는 그 버전 그림 · 스타일로 돌린다. 서버(service role)만 읽고 쓴다.';

-- 클라이언트 정책 없음 = 브라우저에서 직접 읽고 쓸 수 없다(service role 만, writer_runs 와 같은 관례).
alter table public.artist_versions enable row level security;

-- 배경 카드 기록의 "지금 그림" 색인(idx_loc_img_candidates_one_selected)은 바꾸지 않는다 — 모습마다로 바꾸기는 보류(2026-10-31 오너).
--   그래서 버전을 불러올 때 다른 모습이 있는 배경은 지금 그림 그대로 둔다(style-versions-server restoreSnapshot).

commit;
