-- 012_generation_jobs.sql
-- FAL 비동기 생성 작업 추적 테이블 (webhook 전환 기반).
--
-- 목적: 이미지/영상 생성을 동기 blocking 대신 submit→webhook(/poll reconcile) 비동기로 돌리기 위해
--       작업 상태를 DB에 영속화한다. FAL request_id로 식별, 완료 시 webhook 핸들러가 result_url 기록.
--
-- 보안: RLS ENABLE + policy 없음 = service_role(서버 API 라우트)만 접근 가능.
--       클라이언트(anon/authenticated)는 직접 read/write 불가 → 반드시 인증 API 라우트
--       (GET /api/generation-jobs/[id], 소유권 체크) 경유. (decisions: webhook 전환 보안)
--
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행 필요.

CREATE TABLE IF NOT EXISTS generation_jobs (
  id           uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  request_id   text NOT NULL UNIQUE,                 -- FAL request_id (gateway_request_id)
  model        text NOT NULL,                         -- FAL 모델 id (fetch/reconcile 시 필요)
  kind         text NOT NULL,                         -- 'character_view' | 'shot_video'
  status       text NOT NULL DEFAULT 'queued',        -- 'queued' | 'completed' | 'failed'
  target       jsonb NOT NULL DEFAULT '{}'::jsonb,    -- 완료 시 무엇을 갱신할지: 캐릭터뷰{workspaceId,characterId,view,column} / 영상{shotId,writerShotId}
  result_url   text,                                  -- 최종 저장 URL (캐릭터=storage publicUrl, 영상=video url)
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_request_id ON generation_jobs(request_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_project     ON generation_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status      ON generation_jobs(status);

-- service_role 전용. 클라이언트 직접 접근 차단(정책 미부여 = 모두 거부, service_role은 RLS 우회).
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;
