-- #batch-resume (2026-09-09): 일괄 생성을 브라우저 없이 이어가기 위한 묶음 표시.
--
-- 문제: "영상 다 만들기" 의 순번이 브라우저 메모리에만 있었다. 서버 한도가 동시 3개라
--   브라우저가 3개씩 내고 완료를 기다리며 8~10분 붙잡혀 있었고, 그 사이 새로고침하면
--   아직 안 낸 것이 통째로 사라졌다. 아무 안내도 기록도 없었다.
--
-- 새 표를 만들지 않고 generation_jobs 에 두 칸만 더한다. 잡 조회 경로가 이미 이 표를 보므로
--   묶음 판정에 조인이 필요 없다.
--     batch_id    같은 일괄에서 나온 잡끼리 묶는 값(단건 생성은 null)
--     batch_total 그 일괄이 만들기로 한 개수 — 남은 개수 = total - 이 묶음의 잡 수
--
-- 남은 "목록" 은 저장하지 않는다. 어떤 샷이 남았는지는 "완성 영상이 없는 샷" 을 다시 세면
--   나오기 때문이다(eligibleVideoBatchShotIds 가 지금도 그렇게 고른다). 저장하는 것은
--   "몇 개 만들기로 했나" 하나뿐이다 — 그래야 일부러 건너뛴 샷과 중단돼 못 만든 샷이 구분된다.
--
-- 적용: supabase db query --linked 로 문장 개별 실행 (db push 막힘 — 20260813010000 주석 참조).
-- 소유자 경로(RLS owner-write)라 정책 추가 불요.

alter table public.generation_jobs
  add column if not exists batch_id uuid;

alter table public.generation_jobs
  add column if not exists batch_total integer;

-- 총량은 양수여야 한다. 0 이나 음수면 "남은 개수" 계산이 무의미해진다.
alter table public.generation_jobs
  drop constraint if exists generation_jobs_batch_total_positive;
alter table public.generation_jobs
  add constraint generation_jobs_batch_total_positive
  check (batch_total is null or batch_total > 0);

-- 두 칸은 함께 있거나 함께 없어야 한다 — 한쪽만 있으면 이어가기가 판단할 수 없다.
alter table public.generation_jobs
  drop constraint if exists generation_jobs_batch_pair;
alter table public.generation_jobs
  add constraint generation_jobs_batch_pair
  check ((batch_id is null) = (batch_total is null));

-- 이어가기는 "이 묶음의 잡" 을 세는 것이 전부다. 부분 인덱스로 단건 생성 행은 제외한다.
create index if not exists generation_jobs_batch_idx
  on public.generation_jobs (batch_id)
  where batch_id is not null;
