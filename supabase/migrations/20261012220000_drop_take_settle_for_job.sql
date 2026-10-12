begin;

-- take_settle_for_job(20261012210000)을 지운다 (오너 확인 2026-10-12).
--
-- 왜: 대체 모델(미니맥스·해피홀스)이 영상을 만들면 사용자는 처음 고른 모델 값을 그대로 낸다. 차액을
--   돌려주지 않는다. Take 를 돌려주는 건 마지막 대체 모델까지 실패했을 때뿐이고, 그건 기존
--   take_release_for_job 이 한다. 이 함수를 부르는 코드는 같은 날 지웠다.
drop function if exists public.take_settle_for_job(uuid, integer);

commit;
