-- 관리자가 등록 고객의 남은 Take 수를 정한 수로 바로 바꾼다 (오너 2026-11-22).
--   · 남은 수는 고객 계정 화면 · 영상 생성 확인(take_hold)과 같은 계산이다. 만료된 Take는 빼고, 생성 중 잡아둔 Take도 빠져 있다.
--   · 늘릴 때: 그 등록이 아직 이용 중이면 늘린 만큼을 바우처 Take로 넣어 바우처 종료일에 함께 끝나게 한다.
--     그래서 [저장]으로 종료일을 옮기면 함께 옮겨지고, 티어를 바꾸거나 [해지]하면 함께 회수된다.
--     이용이 끝난 등록이면 따라 끝날 기간이 없으므로 기한 없는 보너스 Take로 넣는다.
--   · 줄일 때: 이 등록의 바우처 Take에서 먼저 빼고, 모자라면 영상 만들 때 쓰는 순서(무료 → 플랜 → 팩 → 보너스)대로 뺀다.
--     장부(take_ledger)는 고치지 않고 쌓기만 하므로 manual_adjust 음수 행을 해당 적립(grant_id)에 붙인다.
--     적립에 붙이지 않은 음수는 그 적립이 만료될 때 잔액을 0 아래로 끌어내리므로 쓰지 않는다.
--   · take_hold 와 같은 작업공간 잠금을 잡는다 — 세는 동안 영상 생성 차감이 끼어들지 않는다.
begin;

create or replace function public.admin_set_account_takes(p_redemption uuid, p_target integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_redemption public.voucher_redemptions%rowtype;
  v_workspace uuid;
  v_open boolean;
  v_event text := gen_random_uuid()::text;
  v_before integer;
  v_left integer;
  v_take integer;
  v_lot record;
begin
  if p_target is null or p_target < 0 or p_target > 1000000 then
    raise exception 'invalid take target';
  end if;
  select * into v_redemption from public.voucher_redemptions where id = p_redemption for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  v_workspace := v_redemption.redeemed_workspace_id;
  if v_workspace is null then return jsonb_build_object('status', 'no_account'); end if;
  perform pg_advisory_xact_lock(hashtext(v_workspace::text));

  -- take_hold(20260914170000)와 같은 잔액 계산.
  with ledger as materialized (select * from public.take_resolved_ledger(v_workspace))
  select coalesce(sum(parts.remaining), 0) into v_before
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

  v_open := v_redemption.plan_ended_at is null and v_redemption.plan_ends_at > now();

  if p_target > v_before then
    if v_open then
      insert into public.take_ledger (workspace_id, delta, kind, expires_at, ref_kind, ref_id, reason)
      values (v_workspace, p_target - v_before, 'grant_plan', v_redemption.plan_ends_at,
        'voucher_admin_plan', p_redemption::text || ':' || v_event, 'admin set takes to ' || p_target);
    else
      insert into public.take_ledger (workspace_id, delta, kind, ref_kind, ref_id, reason)
      values (v_workspace, p_target - v_before, 'grant_bonus', 'admin_take_set', v_event, 'admin set takes to ' || p_target);
    end if;
  elsif p_target < v_before then
    v_left := v_before - p_target;
    for v_lot in
      with ledger as materialized (select * from public.take_resolved_ledger(v_workspace))
      select g.id, g.delta + coalesce(sum(c.delta), 0) as remaining
        from ledger g
        join public.take_ledger src on src.id = g.id
        left join ledger c on c.grant_id = g.id
       where g.kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
         and (g.expires_at is null or g.expires_at > now())
       group by g.id, g.delta, g.kind, g.created_at, src.ref_kind, src.ref_id
       order by
         case when (src.ref_kind = 'voucher_redemption' and src.ref_id = p_redemption::text)
                or (src.ref_kind = 'voucher_admin_plan' and src.ref_id like p_redemption::text || ':%') then 0 else 1 end,
         case g.kind when 'grant_free' then 1 when 'grant_plan' then 2 when 'grant_purchase' then 3 when 'grant_bonus' then 4 end,
         g.created_at, g.id
    loop
      exit when v_left <= 0;
      continue when v_lot.remaining <= 0;
      v_take := least(v_lot.remaining, v_left);
      insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
      values (v_workspace, -v_take, 'manual_adjust', v_lot.id, 'admin_take_set', v_event, 'admin set takes to ' || p_target);
      v_left := v_left - v_take;
    end loop;
    -- 적립 밖의 양수(예전 수동 조정)만 남은 경우다. 그 양수를 상쇄한다.
    if v_left > 0 then
      insert into public.take_ledger (workspace_id, delta, kind, ref_kind, ref_id, reason)
      values (v_workspace, -v_left, 'manual_adjust', 'admin_take_set', v_event, 'admin set takes to ' || p_target);
    end if;
  end if;

  return jsonb_build_object('status', 'updated', 'before', v_before, 'after', p_target);
end;
$$;

revoke all on function public.admin_set_account_takes(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_set_account_takes(uuid, integer) to service_role;

commit;
