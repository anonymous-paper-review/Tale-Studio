-- #F-005 F5-R2 (2026-08-13): 빈 문자열 prompt 쓰기를 에러로 승격 — 인계철선.
-- F-005 사고: director write-through 회귀(2eb25ea)가 몇 주간 조용히 420행/11프로젝트의
-- prompt 를 '' 로 덮었고, 하류 품질 저하로만 간접 관측됐다. 이 제약이 있으면 같은 회귀는
-- 배포 직후 첫 저장에서 시끄럽게 실패한다(피해 단위: 프로젝트 11개 → 요청 1개).
--
-- NULL 은 합법이다 — 채팅/수동 샷은 prompt 없이 태어난다(정상 상태). 금지는 '' 하나뿐이며
-- '' 는 사용자가 만들 수 없는 값, 코드 버그만 쓰는 값이다.
-- 전제: 기존 공란 0행 (F5-R3 소급 복구 완료 후에만 걸 수 있다 — 2026-08-12 완료).
-- 적용: supabase db query --linked, 문장 개별 실행. 2026-08-13 적용 완료.

alter table public.shots
  add constraint shots_prompt_not_blanked
  check (prompt is null or length(btrim(prompt)) > 0);
