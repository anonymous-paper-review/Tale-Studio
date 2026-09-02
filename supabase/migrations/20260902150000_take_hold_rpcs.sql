begin;

-- Take hold RPC(원자 관문) + 반환 — 결제 준비 phase-2 슬라이스 2 (#payments-phase-2, #gen-quota-atomic-gate).
--
-- 배경: take_ledger(20260901220000)는 append-only 잔액 원장 스키마만 깔았다. 이 마이그레이션은
--   그 원장에 hold/hold_release 행을 원자적으로 쓰는 RPC 둘을 추가해 실제 생성 경로와 잇는다.
--   같은 워크스페이스의 동시 hold 요청이 잔액을 오버슛하지 못하게 pg_advisory_xact_lock 으로
--   직렬화한다 — count-then-submit 경쟁(티켓 gen-quota-atomic-gate, 2026-09-01 실측 오버슛 11)을
--   여기서 함께 닫는다.
--
-- 단계적 활성화(오너 확정): TAKE_BILLING_MODE env 가 off/shadow/enforce 를 고른다. 이 RPC 자체는
--   그 스위치를 모른다 — p_enforce 인자로 서버 래퍼(src/lib/billing/take-hold.ts)가 mode 를 번역해
--   넘긴다. shadow 는 p_enforce=false 로 호출해 잔액 부족이어도 hold 를 기록하고 통과시킨다
--   (음수 잔액 허용 — 실측용 관측 모드).

-- ── take_hold: lot 배분 hold 삽입 ──
--   소진 순서(v4 2_Take경제): grant_free → grant_plan → grant_purchase → grant_bonus,
--   같은 kind 안에서는 created_at 오름차순(선입선출). 각 grant 의 잔여는
--   grant.delta + 그 grant_id 를 참조하는 모든 후속 원장 행(hold/consume/hold_release 등)의 delta 합.
--   배분으로 다 못 채우면 남는 양은 grant_id NULL 인 hold 행 하나로 — 잔액이 음수로 내려갈 수
--   있는 지점이고, shadow 모드가 이 경로를 의도적으로 허용한다.
create or replace function public.take_hold(
  p_workspace uuid,
  p_amount integer,
  p_job uuid,
  p_enforce boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
  v_remaining integer;
  v_grant record;
  v_grant_remaining integer;
  v_take integer;
  v_held integer := 0;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'take_hold: amount must be a positive integer';
  end if;

  -- 워크스페이스 단위 직렬화 — 동시 hold 요청이 같은 잔액 스냅샷을 놓고 경쟁하지 못하게 막는다.
  perform pg_advisory_xact_lock(hashtext(p_workspace::text));

  select coalesce(sum(delta), 0) into v_balance
  from public.take_ledger
  where workspace_id = p_workspace;

  if p_enforce and v_balance < p_amount then
    return jsonb_build_object('ok', false, 'balance', v_balance, 'held', 0, 'insufficient', true);
  end if;

  v_remaining := p_amount;

  -- lot 배분: grant_* 행을 소진 순서(kind 우선순위 → created_at FIFO)로 순회하며 잔여만큼 hold.
  for v_grant in
    select
      tl.id,
      tl.delta,
      case tl.kind
        when 'grant_free' then 1
        when 'grant_plan' then 2
        when 'grant_purchase' then 3
        when 'grant_bonus' then 4
      end as kind_order,
      tl.created_at
    from public.take_ledger tl
    where tl.workspace_id = p_workspace
      and tl.kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
    order by kind_order asc, tl.created_at asc, tl.id asc
  loop
    exit when v_remaining <= 0;

    select v_grant.delta + coalesce(sum(child.delta), 0) into v_grant_remaining
    from public.take_ledger child
    where child.grant_id = v_grant.id;

    if v_grant_remaining <= 0 then
      continue;
    end if;

    v_take := least(v_grant_remaining, v_remaining);
    insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
    values (p_workspace, -v_take, 'hold', v_grant.id, 'generation_job', p_job::text, 'take_hold lot allocation');

    v_remaining := v_remaining - v_take;
    v_held := v_held + v_take;
  end loop;

  -- 배분으로 못 채운 잔여는 grant_id 없는 hold 행 하나로 — 잔액이 음수로 내려갈 수 있다(shadow 전용,
  --   enforce 는 위 잔액 검사에서 이미 걸러졌으므로 이 분기는 enforce 경로에서는 도달하지 않는다).
  if v_remaining > 0 then
    insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
    values (p_workspace, -v_remaining, 'hold', null, 'generation_job', p_job::text, 'take_hold unallocated (over-lot)');
    v_held := v_held + v_remaining;
  end if;

  select coalesce(sum(delta), 0) into v_balance
  from public.take_ledger
  where workspace_id = p_workspace;

  return jsonb_build_object('ok', true, 'balance', v_balance, 'held', v_held, 'insufficient', false);
end;
$$;

-- ── take_release_for_job: 미반환 hold 잔량을 hold_release 로 되돌린다(멱등) ──
--   같은 잡을 여러 번 불러도(reconcile 재시도 등) 이미 전액 반환됐으면 0 을 반환하고 아무 행도
--   더 쓰지 않는다 — hold 합(음수)과 기존 release 합(양수)을 더해 미반환 잔량만 계산하기 때문에
--   두 번째 호출은 잔량이 0이라 루프가 아무것도 하지 않는다.
create or replace function public.take_release_for_job(
  p_job uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace uuid;
  v_hold record;
  v_release_total integer;
  v_hold_remaining integer;
  v_released integer := 0;
begin
  select workspace_id into v_workspace
  from public.take_ledger
  where ref_kind = 'generation_job' and ref_id = p_job::text and kind = 'hold'
  limit 1;

  if v_workspace is null then
    return 0; -- 이 잡에 대한 hold 가 없다 — 과금 대상 아님(previz 등) 혹은 mode=off 였던 시기.
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace::text));

  -- hold 별로 이미 반환된 만큼을 뺀 "그 hold 의 미반환 잔량"을 grant_id 그대로 미러링해 되돌린다.
  --   hold_release 행은 ref_kind/ref_id 로 같은 job 을 가리키고, grant_id 로 원래 hold 가 소진한
  --   lot 을 가리켜 그 lot 의 잔여 계산(take_hold 의 v_grant_remaining)과 정합을 유지한다.
  for v_hold in
    select id, grant_id, -delta as amount
    from public.take_ledger
    where ref_kind = 'generation_job' and ref_id = p_job::text and kind = 'hold'
    order by created_at asc, id asc
  loop
    select coalesce(sum(delta), 0) into v_release_total
    from public.take_ledger
    where ref_kind = 'generation_job' and ref_id = p_job::text and kind = 'hold_release'
      and grant_id is not distinct from v_hold.grant_id;

    v_hold_remaining := v_hold.amount - v_release_total;
    if v_hold_remaining <= 0 then
      continue;
    end if;

    insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
    values (v_workspace, v_hold_remaining, 'hold_release', v_hold.grant_id, 'generation_job', p_job::text, 'take_release_for_job');

    v_released := v_released + v_hold_remaining;
  end loop;

  return v_released;
end;
$$;

revoke all on function public.take_hold(uuid, integer, uuid, boolean) from public, anon, authenticated;
revoke all on function public.take_release_for_job(uuid) from public, anon, authenticated;
grant execute on function public.take_hold(uuid, integer, uuid, boolean) to service_role;
grant execute on function public.take_release_for_job(uuid) to service_role;

commit;
