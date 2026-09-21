-- 생성 자리 확보를 DB 한 걸음으로 원자화한다 — 개인 영상 3 · 개인 이미지 6 · fal 계정별 · 전체 합계.
--
-- 왜(감사 2026-09-11): 서버는 "세고 나서 넣는" 두 단계였고 그 사이에 다른 요청이 끼어들 수 있었다.
--   동시 제출 실측에서 상한 67 이 79 까지 넘어갔다. 세기와 넣기가 같은 트랜잭션 안에 있어야 한다.
--   그래서 영상만 보던 기존 트리거(20260909120000)를 네 축 전부로 넓혀 대체한다.
-- 오너 결정(2026-09-11): 자동 재시도는 없다 — 거절이 곧 사용자에게 보이는 문장이다. 그래서 서버가
--   고른 fal 계정이 그 순간 차 있어도, 여유 있는 다른 계정이 있으면 거절하지 않고 그 계정으로 바꿔
--   넣는다. "옆 계정이 비어 있는데 막혔다"는 오탐을 사용자가 그대로 뒤집어쓰지 않게 하려는 것이다.
begin;

-- 계정별 동시 실행 상한. 트리거는 환경변수(FAL_KEYS)를 읽을 수 없으므로 서버가 이 표로 옮겨 적는다
--   (src/lib/generation-quota.ts 의 syncFalKeyLimits — 관리자 예외 표 동기화와 같은 규약).
create table public.fal_key_limits (
  key_id text primary key,
  max_inflight integer not null check (max_inflight > 0),
  updated_at timestamptz not null default now()
);
alter table public.fal_key_limits enable row level security;
revoke all on public.fal_key_limits from public, anon, authenticated;
grant all on public.fal_key_limits to service_role;

-- 집계 창(최근 30분 queued)을 그대로 타는 부분 인덱스 — 기존 generation_jobs_active_video_user_idx 관례.
create index generation_jobs_active_user_idx
  on public.generation_jobs (user_id, created_at)
  where status = 'queued';
create index generation_jobs_active_key_idx
  on public.generation_jobs (fal_key_id, created_at)
  where status = 'queued';

create function public.enforce_generation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- 좀비(webhook 유실로 영원히 queued 인 행)가 자리를 영구 점유하지 않도록 서버와 같은 신선도 컷을 쓴다.
  v_cutoff timestamptz := now() - interval '30 minutes';
  v_video boolean;
  v_count integer;
  v_limit integer;
  v_total integer;
  v_key text;
begin
  if new.status <> 'queued' or new.user_id is null then
    return new;
  end if;
  v_video := new.kind in ('shot_video', 'shot_previz_video');

  -- 축마다 따로 잠그면 요청마다 순서가 달라져 교착이 난다. 자리 확보 전체를 하나로 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended('generation-capacity', 0));

  -- 개인 축 — 관리자(운영·QA)는 면제. 명단 동기화는 서버가 한다(generation_capacity_exempt_users).
  if not exists (select 1 from public.generation_capacity_exempt_users where user_id = new.user_id) then
    if v_video then
      select count(*) into v_count
      from public.generation_jobs
      where user_id = new.user_id and status = 'queued'
        and kind in ('shot_video', 'shot_previz_video')
        and created_at >= v_cutoff;
      -- 3/6 의 근거는 generation-quota.ts 의 MAX_QUEUED_*_JOBS_PER_USER 주석(2026-08-26 오너 결정).
      if v_count >= 3 then
        raise exception 'video_user_at_capacity' using detail = v_count::text;
      end if;
    else
      select count(*) into v_count
      from public.generation_jobs
      where user_id = new.user_id and status = 'queued'
        and kind not in ('shot_video', 'shot_previz_video')
        and created_at >= v_cutoff;
      if v_count >= 6 then
        raise exception 'image_user_at_capacity' using detail = v_count::text;
      end if;
    end if;
  end if;

  -- 계정 축 — 표에 없는 키(동기화 전·폐기된 키)는 상한을 모르므로 검사하지 않는다.
  select max_inflight into v_limit from public.fal_key_limits where key_id = new.fal_key_id;
  if v_limit is not null then
    select count(*) into v_count
    from public.generation_jobs
    where fal_key_id = new.fal_key_id and status = 'queued' and created_at >= v_cutoff;
    if v_count >= v_limit then
      -- 여유(max_inflight − 최근 30분 queued)가 가장 큰 다른 계정으로 바꿔 넣는다(오너 결정 2026-09-11).
      select l.key_id into v_key
      from public.fal_key_limits l
      where l.key_id <> new.fal_key_id
        and l.max_inflight > (
          select count(*)
          from public.generation_jobs j
          where j.fal_key_id = l.key_id and j.status = 'queued' and j.created_at >= v_cutoff
        )
      order by
        l.max_inflight - (
          select count(*)
          from public.generation_jobs j
          where j.fal_key_id = l.key_id and j.status = 'queued' and j.created_at >= v_cutoff
        ) desc,
        l.key_id
      limit 1;
      if v_key is null then
        raise exception 'key_at_capacity' using detail = v_count::text || '/' || v_limit::text;
      end if;
      new.fal_key_id := v_key;
    end if;
  end if;

  -- 전체 축 — 계정 슬롯 합계는 물리 한도다. 관리자도 받는다(면제 대상이 아니다).
  select coalesce(sum(max_inflight), 0) into v_total from public.fal_key_limits;
  if v_total > 0 then
    select count(*) into v_count
    from public.generation_jobs
    where status = 'queued' and created_at >= v_cutoff;
    if v_count >= v_total then
      raise exception 'global_at_capacity' using detail = v_count::text || '/' || v_total::text;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.enforce_generation_capacity() from public, anon, authenticated;
grant execute on function public.enforce_generation_capacity() to service_role;

-- 영상만 보던 기존 게이트를 남겨두면 같은 행을 두 번 판정한다 — 새 트리거가 그 역할을 흡수한다.
drop trigger if exists generation_jobs_video_capacity on public.generation_jobs;
drop function if exists public.enforce_generation_video_capacity();

create trigger generation_jobs_capacity
  before insert on public.generation_jobs
  for each row execute function public.enforce_generation_capacity();

notify pgrst, 'reload schema';
commit;
