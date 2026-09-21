-- 작업 단위 차감/반환 직렬화. 과거 원장을 일괄 수정하지 않고 이후 호출부터 적용한다.
begin;

create or replace function public.take_hold(p_workspace uuid, p_amount integer, p_job uuid, p_enforce boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_job record;
  v_existing_held integer;
  v_balance integer;
  v_remaining integer;
  v_grant record;
  v_take integer;
  v_held integer := 0;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'take_hold: amount must be a positive integer';
  end if;

  -- hold/release 모두 작업 → 작업 행 → 작업공간 순서로 잠근다.
  -- 실패 상태 변경과의 행 잠금으로, 반환 조회를 먼저 끝낸 뒤 늦은 차감이 생기는 경합도 막는다.
  perform pg_advisory_xact_lock(hashtextextended('take-job:' || p_job::text, 0));
  select j.status, coalesce(j.workspace_id, p.workspace_id) as workspace_id into v_job
  from public.generation_jobs j left join public.projects p on p.id = j.project_id
  where j.id = p_job for update of j;
  if not found then
    raise exception 'take_hold_job_missing';
  end if;
  if p_workspace is null or v_job.workspace_id is distinct from p_workspace then
    raise exception 'take_hold_workspace_mismatch';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_workspace::text));

  if exists (
    select 1 from public.take_ledger
    where ref_kind = 'generation_job' and ref_id = p_job::text
      and kind in ('hold', 'hold_release') and workspace_id is distinct from p_workspace
  ) then
    raise exception 'take_hold_workspace_mismatch';
  end if;
  -- 반환은 작업의 차감 종료를 뜻한다. 같은 작업을 다시 차감하지 않는다.
  if exists (
    select 1 from public.take_ledger
    where ref_kind = 'generation_job' and ref_id = p_job::text and kind = 'hold_release'
  ) then
    raise exception 'take_hold_already_released';
  end if;
  select coalesce(-sum(delta), 0) into v_existing_held
  from public.take_ledger
  where ref_kind = 'generation_job' and ref_id = p_job::text and kind = 'hold';
  if v_existing_held > 0 and v_existing_held <> p_amount then
    raise exception 'take_hold_amount_mismatch';
  end if;
  if v_job.status not in ('queued', 'completed')
    or (v_existing_held = 0 and v_job.status <> 'queued') then
    raise exception 'take_hold_job_not_queued';
  end if;

  -- 20260909130000의 환불 연결·만료 잔액 계산과 지급분 배분을 유지한다.
  with ledger as materialized (select * from public.take_resolved_ledger(p_workspace))
  select coalesce(sum(parts.remaining), 0) into v_balance
  from (
    select case when g.expires_at is not null and g.expires_at <= now()
      then least(0, g.delta + coalesce(sum(c.delta) filter (where c.kind <> 'expire'), 0))
      else g.delta + coalesce(sum(c.delta), 0) end as remaining
    from ledger g left join ledger c on c.grant_id = g.id
    where g.kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
    group by g.id, g.delta, g.expires_at
    union all
    select o.delta from ledger o
    where o.kind not in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
      and not exists (select 1 from ledger g where g.id = o.grant_id
        and g.kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus'))
  ) parts;

  -- 최초 차감으로 잔액이 소진됐어도 같은 요청의 재전송은 성공한 원처리를 반환한다.
  if v_existing_held > 0 then
    return jsonb_build_object('ok', true, 'balance', v_balance, 'held', v_existing_held,
      'insufficient', false, 'replayed', true);
  end if;
  if p_enforce and v_balance < p_amount then
    return jsonb_build_object('ok', false, 'balance', v_balance, 'held', 0, 'insufficient', true);
  end if;
  v_remaining := p_amount;

  -- 가용 잔액뿐 아니라 배분도 동일한 환불 연결을 사용한다. 환불한 lot으로 새 작업을 예약하지 않는다.
  for v_grant in
    with ledger as materialized (select * from public.take_resolved_ledger(p_workspace))
    select g.id, g.delta + coalesce(sum(c.delta), 0) as remaining,
      case g.kind when 'grant_free' then 1 when 'grant_plan' then 2
        when 'grant_purchase' then 3 when 'grant_bonus' then 4 end as kind_order, g.created_at
    from ledger g left join ledger c on c.grant_id = g.id
    where g.kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
      and (g.expires_at is null or g.expires_at > now())
    group by g.id, g.delta, g.kind, g.created_at
    order by kind_order, g.created_at, g.id
  loop
    exit when v_remaining <= 0;
    continue when v_grant.remaining <= 0;
    v_take := least(v_grant.remaining, v_remaining);
    insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
    values (p_workspace, -v_take, 'hold', v_grant.id, 'generation_job', p_job::text, 'take_hold');
    v_held := v_held + v_take;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    insert into public.take_ledger (workspace_id, delta, kind, ref_kind, ref_id, reason)
    values (p_workspace, -v_remaining, 'hold', 'generation_job', p_job::text, 'take_hold (unallocated)');
    v_held := v_held + v_remaining;
  end if;
  return jsonb_build_object('ok', true, 'balance', v_balance, 'held', v_held,
    'insufficient', false, 'replayed', false);
end;
$$;

create or replace function public.take_release_for_job(p_job uuid)
returns integer language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace uuid;
  v_hold record;
  v_released integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('take-job:' || p_job::text, 0));
  -- 삭제된 과거 작업도 원장이 남아 있다면 반환할 수 있다.
  perform 1 from public.generation_jobs where id = p_job for update;

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

revoke all on function public.take_hold(uuid, integer, uuid, boolean) from public, anon, authenticated;
revoke all on function public.take_release_for_job(uuid) from public, anon, authenticated;
grant execute on function public.take_hold(uuid, integer, uuid, boolean) to service_role;
grant execute on function public.take_release_for_job(uuid) to service_role;

commit;
