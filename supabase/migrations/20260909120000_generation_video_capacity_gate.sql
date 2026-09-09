-- #batch-resume: 개별·일괄·previz가 섞여도 영상 예약을 사용자별로 직렬화한다.
-- 관리자 판정은 서버의 기존 isAdminEmail이 전달한다. SQL에 이메일 목록을 복제하지 않는다.
begin;

create table public.generation_capacity_exempt_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.generation_capacity_exempt_users enable row level security;
revoke all on public.generation_capacity_exempt_users from public, anon, authenticated;
grant all on public.generation_capacity_exempt_users to service_role;

create index generation_jobs_active_video_user_idx
  on public.generation_jobs (user_id, created_at)
  where status = 'queued' and kind in ('shot_video', 'shot_previz_video');

create function public.enforce_generation_video_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_queued integer;
begin
  if new.status <> 'queued' or new.kind not in ('shot_video', 'shot_previz_video') or new.user_id is null then
    return new;
  end if;
  if exists (select 1 from public.generation_capacity_exempt_users where user_id = new.user_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':video-capacity', 0));
  -- 기존 일반 생성의 30분 집계 창을 유지한다. 배치 RPC의 더 엄격한 중단·대기 판정은 그대로 둔다.
  select count(*) into v_queued
  from public.generation_jobs
  where user_id = new.user_id and status = 'queued'
    and kind in ('shot_video', 'shot_previz_video')
    and created_at >= now() - interval '30 minutes';
  if v_queued >= 3 then
    raise exception 'video_user_at_capacity' using detail = v_queued::text;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_generation_video_capacity() from public, anon, authenticated;
grant execute on function public.enforce_generation_video_capacity() to service_role;
create trigger generation_jobs_video_capacity
  before insert on public.generation_jobs
  for each row execute function public.enforce_generation_video_capacity();

notify pgrst, 'reload schema';
commit;
