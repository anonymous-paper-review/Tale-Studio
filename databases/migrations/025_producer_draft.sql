-- 025_producer_draft.sql
-- producer-board-persistence: 핸드오프 전 프로듀서 보드 상태를 세션 간 보존.
--
-- 문제:
--   채팅 메시지는 messages 테이블에 매 메시지 저장되어 재진입 시 복원되지만,
--   프로듀서 보드(러닝타임/장르/톤/스토리/캐스트/배경 카드)는 zustand 메모리에만 존재했다.
--   DB 기록 시점은 핸드오프(saveAndHandoff: projects.story_text/settings + writer 파이프라인의
--   characters/locations) 단 한 번뿐이라, 핸드오프 전에 세션이 끊기거나 새로고침하면 보드가 초기화됐다.
--
-- 해결:
--   projects.producer_draft (jsonb) 에 보드 전체 스냅샷을 디바운스 자동저장한다.
--   loadProject 가 재진입 시 이 드래프트로 보드를 복원한다(없으면 기존 characters/locations 폴백).
--
-- 형태 (앱 코드 ProducerDraft 와 1:1):
--   { "version": 1, "savedAt": <epoch_ms>, "storyText": string, "storyReady": bool,
--     "settings": <ProjectSettings>, "cast": <CastMember[]>, "backgrounds": <BackgroundSource[]> }
--
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행 필요.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS producer_draft JSONB;

COMMENT ON COLUMN projects.producer_draft IS
  'Producer 보드 working-copy 스냅샷(핸드오프 전 세션 간 보존용). loadProject 가 재진입 시 복원한다. 핸드오프 산출물(characters/locations)이 단일 진실이며, 이 컬럼은 프로듀서 단계 UI 상태 보존 전용.';
