begin;

-- 작업에 잡아둔 Take 를 정한 값까지 줄이고 남는 만큼을 돌려준다 (오너 결정 2026-10-12).
--
-- 왜: 영상이 실패해 대체 모델(미니맥스·해피홀스)이 다시 만들면, 사용자가 처음 고른 모델 값과 대체
--   모델 값의 차액은 우리가 감당한다. 처음 모델 값(예: Seedance 5)으로 잡은 hold 를 대체 모델 값
--   (1)까지 낮추고 차액(4)을 hold_release 로 돌려준다.
--
-- 규칙
--   · 줄이기만 한다. 이미 잡은 양이 p_amount 이하이면 아무것도 쓰지 않는다(더 받지 않는다).
--   · 같은 작업에 여러 번 불러도 결과가 같다. 두 번째 호출은 잡힌 양이 이미 p_amount 라 0 을 돌려준다.
--   · 마지막에 꺼내 쓴 묶음부터 되돌린다. take_hold 가 꺼낸 순서(묶음 없는 초과분이 마지막,
--     그 앞은 bonus → purchase → plan → free 의 역순, 같은 종류는 늦게 생긴 것부터)를 거꾸로 밟아
--     "처음부터 p_amount 만 잡았을 때"와 같은 묶음 잔량이 되게 한다.
--   · 잠금은 take_release_for_job(20260914172000)과 같다 — 작업 잠금 → 작업 행 → 작업공간 잠금.
create or replace function public.take_settle_for_job(p_job uuid, p_amount integer)
returns integer language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace uuid;
  v_held integer;
  v_excess integer;
  v_give integer;
  v_hold record;
  v_released integer := 0;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'take_settle_for_job: amount must be a non-negative integer';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('take-job:' || p_job::text, 0));
  perform 1 from public.generation_jobs where id = p_job for update;

  for v_workspace in
    select distinct workspace_id from public.take_ledger
    where ref_kind = 'generation_job' and ref_id = p_job::text and kind in ('hold', 'hold_release')
    order by workspace_id
  loop
    perform pg_advisory_xact_lock(hashtext(v_workspace::text));
  end loop;

  select coalesce(-sum(delta), 0) into v_held
  from public.take_ledger
  where ref_kind = 'generation_job' and ref_id = p_job::text and kind in ('hold', 'hold_release');

  v_excess := v_held - p_amount;
  if v_excess <= 0 then
    return 0;
  end if;

  for v_hold in
    select
      h.workspace_id,
      h.grant_id,
      -sum(h.delta) as remaining,
      case g.kind
        when 'grant_free' then 1
        when 'grant_plan' then 2
        when 'grant_purchase' then 3
        when 'grant_bonus' then 4
      end as kind_order,
      g.created_at as grant_created_at
    from public.take_ledger h
    left join public.take_ledger g on g.id = h.grant_id
    where h.ref_kind = 'generation_job' and h.ref_id = p_job::text and h.kind in ('hold', 'hold_release')
    group by h.workspace_id, h.grant_id, g.kind, g.created_at
    having sum(h.delta) < 0
    order by (h.grant_id is null) desc, kind_order desc, grant_created_at desc, h.grant_id desc
  loop
    exit when v_excess <= 0;
    v_give := least(v_hold.remaining, v_excess);
    insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
    values (v_hold.workspace_id, v_give, 'hold_release', v_hold.grant_id,
      'generation_job', p_job::text, 'take_settle_for_job');
    v_excess := v_excess - v_give;
    v_released := v_released + v_give;
  end loop;

  return v_released;
end;
$$;

revoke all on function public.take_settle_for_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.take_settle_for_job(uuid, integer) to service_role;

commit;
