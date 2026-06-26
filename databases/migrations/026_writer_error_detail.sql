-- 026_writer_error_detail.sql
-- error-logging-mvp: writer 실행 실패 시 진단 컨텍스트를 DB 에 영속화.
--
-- 문제:
--   실패 시 writer_runs.error 에는 메시지 한 줄만 남고, 상세(직전 LLM 호출의 prompt/response/
--   error/model/latency)는 콘솔(휘발) + 로컬 FS 로그에만 있었다. Vercel 서버리스는 FS 가 읽기전용이라
--   raw 로그가 통째로 no-op → 프로덕션에선 "왜 실패했나"의 상세가 영구 저장되지 않았다.
--
-- 해결:
--   writer_runs.error_detail (jsonb) 에 markFailed 시점의 진단 스냅샷을 적재한다.
--   형태 (run-store WriterErrorDetail 와 1:1):
--     { "stage": string, "message": string, "at": <iso>,
--       "calls": [ { provider, model, error?, finish_reason?, duration_ms,
--                    input_chars, output_chars, prompt(<=4000), response(<=4000) } ] }
--   직전 최대 3개 호출만, prompt/response 는 4000자로 truncate (행 크기 제한).
--
-- ⚠️ 라이브 DB는 마이그레이션과 분리 운영 → Supabase 대시보드 SQL 에디터에서 직접 실행 필요.

ALTER TABLE writer_runs
  ADD COLUMN IF NOT EXISTS error_detail JSONB;

COMMENT ON COLUMN writer_runs.error_detail IS
  'writer 실패 진단 스냅샷(직전 LLM 호출 prompt/response/error/latency). 서버리스 FS no-op 환경의 durable 진단 경로. error 한 줄 메시지의 상세 보강용.';
