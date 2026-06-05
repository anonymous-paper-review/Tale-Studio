-- 013_drop_legacy_character_views.sql
-- 레거시 캐릭터 뷰 컬럼 정리 — front→main 통합(2026-06-05) 이후 코드 미참조 컬럼 제거.
-- Created: 2026-06-05 KST
--
-- 배경: 010_character_turnaround_views 에서 view_front/view_side/view_three_quarter_* 를
--       "deprecate, 후속 정리"로 남겨뒀다. 코드(types/asset.ts CHARACTER_VIEW_COLUMNS)는
--       {view_main, view_back, view_side_left, view_side_right} 4개만 사용한다.
--       그러나 라이브에 view_front(8행)·view_side(6행)에만 존재하는 고아 이미지 URL이 있었다.
--
-- 절차(순서 중요): 1) 고아 데이터를 신 컬럼으로 백필 → 2) 4개 컬럼 DROP.
--   · view_main      ← view_front (정면 대표 포트레이트로 승계)
--   · view_side_left ← view_side  (단일 측면 → 좌측면으로 승계; 우측면은 미생성, 재생성 대상)
--   백필은 멱등(NULL 인 대상에만 적용). 라이브에는 REST 로 선반영 완료(2026-06-05).
--
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행.
--    DROP 은 파괴적이므로 위 백필이 끝난 뒤에만 실행할 것.

-- 1) 백필 (멱등 — 신 컬럼이 비어있고 구 컬럼에 값이 있는 행만)
UPDATE characters
   SET view_main = view_front
 WHERE view_main IS NULL
   AND view_front IS NOT NULL;

UPDATE characters
   SET view_side_left = view_side
 WHERE view_side_left IS NULL
   AND view_side IS NOT NULL;

-- 2) 레거시 컬럼 DROP (백필 검증 후)
ALTER TABLE characters
  DROP COLUMN IF EXISTS view_front,
  DROP COLUMN IF EXISTS view_side,
  DROP COLUMN IF EXISTS view_three_quarter_left,
  DROP COLUMN IF EXISTS view_three_quarter_right;
