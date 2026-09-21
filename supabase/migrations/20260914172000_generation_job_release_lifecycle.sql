-- 완료 영상의 차감을 유지하고, 작업 종료·반환·삭제를 같은 작업 잠금으로 보호한다.
begin;

create or replace function public.take_release_for_job(p_job uuid)
returns integer language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_workspace uuid;
  v_hold record;
  v_released integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('take-job:' || p_job::text, 0));
  -- 삭제된 과거 작업도 원장이 남아 있다면 반환할 수 있다.
  select status into v_status from public.generation_jobs where id = p_job for update;
  -- 완료된 결과의 차감은 늦은 실패 알림이나 삭제 요청으로 반환하지 않는다.
  if v_status = 'completed' then return 0; end if;
  -- 반환 후 삭제까지의 사이에도 늦은 완료/차감이 끼어들 수 없도록 먼저 종료한다.
  -- 차감 기록이 없는 작업도 같은 규칙을 적용한다.
  if v_status = 'queued' then
    update public.generation_jobs
    set status = 'failed', error = 'generation_job_released', last_error = 'generation_job_released',
      completed_at = now(), updated_at = now()
    where id = p_job;
  end if;

  -- 과거 오류로 다른 작업공간에 기록된 hold도 원래 작업공간으로 반환한다.
  for v_workspace in
    select distinct workspace_id from public.take_ledger
    where ref_kind = 'generation_job' and ref_id = p_job::text and kind in ('hold', 'hold_release')
    order by workspace_id
  loop
    perform pg_advisory_xact_lock(hashtext(v_workspace::text));
  end loop;

  -- 한 지급분에 hold가 여러 개 있으면 행별 최대값 대신 합계에서 반환 합계를 뺀다.
  -- NULL grant_id도 하나로 묶어 미배분 차감을 같은 방식으로 처리한다.
  for v_hold in
    select workspace_id, grant_id, -sum(delta) as remaining
    from public.take_ledger
    where ref_kind = 'generation_job' and ref_id = p_job::text and kind in ('hold', 'hold_release')
    group by workspace_id, grant_id
    having sum(delta) < 0
    order by workspace_id, grant_id
  loop
    insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
    values (v_hold.workspace_id, v_hold.remaining, 'hold_release', v_hold.grant_id,
      'generation_job', p_job::text, 'take_release_for_job');
    v_released := v_released + v_hold.remaining;
  end loop;
  return v_released;
end;
$$;

create or replace function public.delete_generation_job_with_release(p_job uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended('take-job:' || p_job::text, 0));
  select status into v_status from public.generation_jobs where id = p_job for update;
  if not found then return true; end if;
  -- 라우트 조회 뒤 완료로 바뀐 작업도 완료 기록과 원장을 유지한다.
  if v_status = 'completed' then return false; end if;

  -- 동일 트랜잭션의 작업 잠금을 재사용한다. 실패하면 삭제도 함께 롤백한다.
  perform public.take_release_for_job(p_job);
  delete from public.generation_jobs where id = p_job;
  return true;
end;
$$;

revoke all on function public.take_release_for_job(uuid) from public, anon, authenticated;
revoke all on function public.delete_generation_job_with_release(uuid) from public, anon, authenticated;
grant execute on function public.take_release_for_job(uuid) to service_role;
grant execute on function public.delete_generation_job_with_release(uuid) to service_role;

commit;
