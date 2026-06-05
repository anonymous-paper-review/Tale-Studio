-- Character 턴어라운드 시트 뷰 컬럼 (additive) — decisions #37 / writer-background-artist-progress §4
-- Created: 2026-06-05 KST
--
-- artist 캐릭터 이미지를 "턴어라운드 시트 1장 → crop → 뷰 분배"로 전환.
-- 뷰 모델: {main, front, back, sideLeft, sideRight}.
--   · view_main       = 1×4 전체 시트 (front|side-L|side-R|back)
--   · view_front      = 기존 컬럼 재사용
--   · view_back       = 기존 컬럼 재사용
--   · view_side_left  = 신규 (crop)
--   · view_side_right = 신규 (crop)
--
-- ⚠️ 가산적(additive). 기존 view_side / view_three_quarter_left / view_three_quarter_right 는
--    드롭하지 않는다 (deprecate — 라이브에 데이터 존재 가능, 후속 정리). IF NOT EXISTS 로 멱등.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS view_main       TEXT,
  ADD COLUMN IF NOT EXISTS view_side_left  TEXT,
  ADD COLUMN IF NOT EXISTS view_side_right TEXT;

COMMENT ON COLUMN characters.view_main IS
  '턴어라운드 시트 전체 이미지 (1×4 스트립: front|side-L|side-R|back). decisions #37.';
COMMENT ON COLUMN characters.view_side_left IS
  '턴어라운드 시트 crop — 좌측면 (side profile, 90deg). decisions #37.';
COMMENT ON COLUMN characters.view_side_right IS
  '턴어라운드 시트 crop — 우측면 (side profile, 90deg). decisions #37.';

-- 후속(이 SQL 범위 밖):
--   · POST /api/artist/generate-sheet 가 위 컬럼에 기록 (§5)
--   · CharacterAsset.views 타입 {main,front,back,sideLeft,sideRight} 전환 (§4)
--   · deprecated 컬럼(view_side, view_three_quarter_*) 정리는 후속 마이그레이션
