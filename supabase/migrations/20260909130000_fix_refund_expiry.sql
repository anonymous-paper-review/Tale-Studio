-- 2026-09-09 오너 승인: 환불 회수분은 만료 때 다시 차감하지 않고, 실사용 부족액은 유지한다.
-- 원 장부는 INSERT-only로 보존한다. 구형 환불은 정확한 사유와 동일 workspace의 유일한 지급분으로만 연결한다.
-- 읽을 때의 가용 잔액과 만료 감사행의 미정산량은 다르다. 이미 기록한 expire를 채무로 세면 안 된다.

create or replace function public.take_resolved_ledger(p_workspace uuid)
returns table (id uuid, kind text, delta integer, grant_id uuid, expires_at timestamptz, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select l.id, l.kind, l.delta, coalesce(l.grant_id, legacy.id), l.expires_at, l.created_at
  from public.take_ledger l
  left join lateral (
    select min(g.id::text)::uuid as id
    from public.take_ledger g
    where l.grant_id is null
      and l.kind = 'refund_revoke' and l.ref_kind = 'paddle_adjustment'
      and g.workspace_id = l.workspace_id
      and g.kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
      and g.ref_kind = 'paddle_transaction'
      and g.ref_id = substring(l.reason from '^paddle (?:refund|chargeback) of (txn_[a-z0-9]+) \([0-9]+%\)$')
    having count(*) = 1
  ) legacy on true
  where l.workspace_id = p_workspace;
$$;
revoke all on function public.take_resolved_ledger(uuid) from public, anon, authenticated;
grant execute on function public.take_resolved_ledger(uuid) to service_role;

create or replace function public.take_hold(p_workspace uuid, p_amount integer, p_job uuid, p_enforce boolean)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
  v_remaining integer;
  v_grant record;
  v_take integer;
  v_held integer := 0;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'take_hold: amount must be a positive integer';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_workspace::text));

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
  return jsonb_build_object('ok', true, 'balance', v_balance, 'held', v_held, 'insufficient', false);
end;
$$;
revoke all on function public.take_hold(uuid, integer, uuid, boolean) from public, anon, authenticated;
grant execute on function public.take_hold(uuid, integer, uuid, boolean) to service_role;

create or replace function public.take_expire_due()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_grant record;
  v_remaining integer;
  v_lots integer := 0;
  v_takes integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('take_expire_due'));
  for v_grant in
    select tl.id, tl.workspace_id, tl.delta from public.take_ledger tl
    where tl.kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
      and tl.expires_at is not null and tl.expires_at <= now()
    order by tl.workspace_id, tl.created_at, tl.id
  loop
    perform pg_advisory_xact_lock(hashtext(v_grant.workspace_id::text));
    -- 감사행은 기존 expire까지 포함한 미정산 잔여만 기록한다. 반복 실행과 실패 반환 후 실행도 멱등이다.
    select v_grant.delta + coalesce(sum(c.delta), 0) into v_remaining
    from public.take_resolved_ledger(v_grant.workspace_id) c where c.grant_id = v_grant.id;
    continue when v_remaining <= 0;
    insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
    values (v_grant.workspace_id, -v_remaining, 'expire', v_grant.id, 'take_lot', v_grant.id::text, 'take_expire_due');
    v_lots := v_lots + 1;
    v_takes := v_takes + v_remaining;
  end loop;
  return jsonb_build_object('lots', v_lots, 'takes', v_takes);
end;
$$;
revoke all on function public.take_expire_due() from public, anon, authenticated;
grant execute on function public.take_expire_due() to service_role;
