-- RLS 잠금 + anon 쓰기 권한 회수 (2026-08-11 보안 감사).
--
-- 감사 실측: public 스키마 22개 테이블 중 8개가 RLS 미적용이었고, anon 롤에
--   SELECT/INSERT/UPDATE/DELETE/TRUNCATE 가 전부 GRANT 돼 있었다. 즉 브라우저 번들에
--   공개된 anon 키만으로 PostgREST 를 직접 때리면 읽기·쓰기가 그대로 통했다.
--   실측(로그인 없음): messages 389행, project_shares 7행(토큰 64자 평문 포함),
--   character_image_candidates 44행, location_image_candidates 57행, style_anchors 12행.
--
--   특히 project_shares 노출이 치명적이었다 — /api/share/[token] 이 토큰 게이트로
--   설계돼 있는데, 그 토큰 목록 자체를 익명이 SELECT 할 수 있으면 게이트가 무의미하다.
--
-- 패턴: 이 DB 의 기존 관례를 따른다.
--   서버 전용 테이블 = RLS ENABLE + 정책 0개 (service_role 은 RLS 를 우회하므로 동작).
--                      예: writer_runs, generation_jobs, llm_calls, editor_states
--   브라우저 직접 읽기 = projects → workspaces.owner_id 소유자 체인 정책.
--                      예: characters, locations, shots, scenes

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) 서버 전용 테이블 — RLS 켜고 정책 없음.
--    코드 확인 결과 전부 supabaseAdmin(service_role) 경유로만 접근한다:
--      messages                  → api/project/[id]/messages (getUser 가드 있음)
--      project_shares            → api/share, api/share/[token]
--      location_image_candidates → lib/fal/finalize.ts
--      camera_light_presets      → api/director/presets (getUser + IDOR 가드 있음)
--      character_relationships   → 코드 참조 0건
--      subtext_notes             → 코드 참조 0건
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.messages                  enable row level security;
alter table public.project_shares            enable row level security;
alter table public.location_image_candidates enable row level security;
alter table public.camera_light_presets      enable row level security;
alter table public.character_relationships   enable row level security;
alter table public.subtext_notes             enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) character_image_candidates — 브라우저가 직접 읽는다.
--    stores/artist-store.ts 가 createClient()(브라우저 anon+세션)로
--    .eq('project_id', projectId) SELECT 를 한다 → 소유자 체인 정책 필요.
--    쓰기(insert/update)는 finalize.ts / draft-trigger.ts 의 service_role 전용이라
--    SELECT 정책만 연다.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.character_image_candidates enable row level security;

create policy "Owner select" on public.character_image_candidates
  for select
  using (
    project_id in (
      select p.id
      from public.projects p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) style_anchors — 공개 카탈로그(프로젝트/유저 데이터 아님).
--    stores/producer-store.ts 가 createCatalogClient() 로 읽는데, 이 클라이언트는
--    데모(공유) 세션에서도 실 anon 으로 붙는다 = 비로그인 읽기가 정당하다.
--    쿼리가 is_active=true 로 필터하므로 정책도 동일 범위로 좁힌다.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.style_anchors enable row level security;

create policy "Public read active" on public.style_anchors
  for select
  using (is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) anon(비로그인) 쓰기 권한 전면 회수.
--    브라우저의 정상 쓰기(shots/scenes/projects/characters/locations 등, stores/*.ts)는
--    로그인 후 authenticated 롤로 일어나므로 영향 없다. anon 쓰기는 앱 어디에서도
--    필요하지 않다 — 공유(데모) 세션의 쓰기는 lib/demo/supabase-shim 이 no-op 처리한다.
--    RLS 가 이미 대부분 막지만, GRANT 자체를 없애 심층 방어를 만든다.
-- ─────────────────────────────────────────────────────────────────────────────
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- 앞으로 만들 테이블에 같은 구멍이 재발하지 않도록 기본 권한도 조정.
--   (이 마이그레이션을 실행하는 롤이 만드는 테이블에 적용된다 — 소유자 postgres 로 확인함)
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon;

commit;
