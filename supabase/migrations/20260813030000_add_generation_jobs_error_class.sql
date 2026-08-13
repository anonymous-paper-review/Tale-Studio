-- #error-class (2026-08-13): 잡 실패 원인 분류 태그 — 클래스별 재시도 정책(P2/P3)의 측정 기반.
-- 분류 규칙의 정본은 코드(src/lib/generation-jobs.ts classifyJobError) — 이 컬럼은 집계 전용.
-- 제약을 걸지 않는 이유: 분류 체계가 진화 중이라 값 추가마다 DDL 을 밟게 하지 않는다.
-- 적용: supabase db query --linked, 문장 개별 실행. 2026-08-13 적용 + 과거 실패 백필 완료.

alter table public.generation_jobs
  add column if not exists error_class text;
