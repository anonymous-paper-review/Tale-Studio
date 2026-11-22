-- 관리자 화면 등록 고객 줄의 [저장] 규칙을 바꾼다 (오너 2026-11-22 B안).
--   · 같은 티어로 이용 중인 고객의 종료일만 바꾸면 남은 바우처 Take 수는 그대로 두고 기한만 새 종료일로 옮긴다.
--     장부(take_ledger)는 고치지 않고 쌓기만 하므로, 남은 만큼 회수하고 같은 수를 새 종료일로 다시 적립한다.
--     이미 새 종료일에 맞춰진 적립은 건드리지 않는다 — 같은 저장을 또 눌러도 장부가 늘지 않는다.
--   · 그 티어의 한 달 치는 티어를 바꾸거나 끝난 등록을 다시 열 때만 새로 준다.
--   · Take 처리는 구독 여부와 상관없이 같다. 구독 중이면 계정 요금제만 구독 그대로 둔다.
--     (이전에는 구독 중이거나 요금제가 바뀐 고객의 남은 Take를 회수만 하고 새로 주지 않았다.)
--   · 이미 만료된 바우처 적립은 회수·이동 대상에서 뺀다. 만료 정리는 take_expire_due 가 한다.
--   · 관리자 회수 기록의 ref_id 는 저장할 때마다 새로 만든다. 생성 중 잡아둔 Take가 회수 뒤에 돌아와
--     같은 적립을 다시 회수해도 유일 인덱스(take_ledger_ref_grant_unique)에 걸리지 않는다.
begin;

create or replace function public.admin_update_voucher_redemption(
  p_redemption uuid,
  p_plan text,
  p_ends_at timestamptz,
  p_revoke boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_redemption public.voucher_redemptions%rowtype;
  v_current_plan text;
  v_subscribed boolean;
  v_moving boolean;
  v_event text := gen_random_uuid()::text;
  v_revoked integer := 0;
  v_granted integer := 0;
  v_row record;
begin
  if not p_revoke and (p_plan is null or p_plan not in ('s1', 's2', 's5', 's10', 'p10', 'p15', 'p20', 'p25', 'p30') or p_ends_at is null) then
    raise exception 'invalid voucher entitlement';
  end if;
  select * into v_redemption from public.voucher_redemptions where id = p_redemption for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_redemption.redeemed_workspace_id is null then
    update public.voucher_redemptions set plan_ended_at = coalesce(plan_ended_at, now()) where id = v_redemption.id;
    return jsonb_build_object('status', 'ended');
  end if;
  select plan into v_current_plan from public.workspaces where id = v_redemption.redeemed_workspace_id for update;
  v_subscribed := exists (
    select 1 from public.subscriptions s where s.workspace_id = v_redemption.redeemed_workspace_id
      and s.status in ('active', 'trialing', 'past_due')
  );
  -- 같은 티어로 아직 이용 중인 등록의 종료일만 바꾸는 저장인가.
  v_moving := not p_revoke and p_ends_at > now() and p_plan = v_redemption.plan
    and v_redemption.plan_ended_at is null and v_redemption.plan_ends_at > now();

  -- 아직 만료되지 않은 바우처 적립에서 남은 Take만 회수한다. 사용한 Take 기록은 보존한다.
  for v_row in
    select g.id, g.delta + coalesce(sum(c.delta), 0) as remaining
      from public.take_ledger g
      left join public.take_ledger c on c.grant_id = g.id
     where g.workspace_id = v_redemption.redeemed_workspace_id
       and g.kind = 'grant_plan'
       and ((g.ref_kind = 'voucher_redemption' and g.ref_id = p_redemption::text)
         or (g.ref_kind = 'voucher_admin_plan' and g.ref_id like p_redemption::text || ':%'))
       and g.expires_at > now()
       and not (v_moving and g.expires_at = p_ends_at)
     group by g.id, g.delta
  loop
    if v_row.remaining > 0 then
      insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
      values (v_redemption.redeemed_workspace_id, -v_row.remaining, 'refund_revoke', v_row.id,
              'voucher_admin_revoke', v_row.id::text || ':' || v_event,
              case when v_moving then 'voucher end date moved by admin' else 'voucher entitlement adjusted by admin' end);
      v_revoked := v_revoked + v_row.remaining;
    end if;
  end loop;

  if p_revoke or p_ends_at <= now() then
    if (v_current_plan = v_redemption.plan or (v_redemption.plan_ended_at is not null and v_current_plan = 'free'))
       and not v_subscribed
       and not exists (
         select 1 from public.voucher_redemptions newer where newer.redeemed_workspace_id = v_redemption.redeemed_workspace_id
           and newer.id <> v_redemption.id and newer.plan_ended_at is null and newer.plan_ends_at > now()
       ) then
      update public.workspaces set plan = 'free' where id = v_redemption.redeemed_workspace_id;
    end if;
    update public.voucher_redemptions set plan_ended_at = now() where id = v_redemption.id;
    return jsonb_build_object('status', 'ended', 'revoked_takes', v_revoked);
  end if;

  update public.voucher_redemptions set plan = p_plan, plan_ends_at = p_ends_at, plan_ended_at = null where id = v_redemption.id;

  -- 기한만 옮길 때는 회수한 수 그대로, 그 밖에는 고른 티어의 한 달 치를 새 종료일까지 적립한다.
  v_granted := case when v_moving then v_revoked else case p_plan
    when 's1' then 16 when 's2' then 30 when 's5' then 60 when 's10' then 100
    when 'p10' then 150 when 'p15' then 200 when 'p20' then 360 when 'p25' then 410 when 'p30' then 710 else 0 end end;
  if v_granted > 0 then
    insert into public.take_ledger (workspace_id, delta, kind, expires_at, ref_kind, ref_id, reason)
    values (v_redemption.redeemed_workspace_id, v_granted, 'grant_plan', p_ends_at,
      'voucher_admin_plan', p_redemption::text || ':' || v_event,
      case when v_moving then 'voucher end date moved by admin' else 'voucher tier adjusted by admin -> ' || p_plan end);
  end if;

  -- 계정 요금제는 이 바우처가 정한 계정에서만 바꾼다. 구독 중이면 구독 요금제를 그대로 둔다.
  if not v_subscribed and (v_current_plan = v_redemption.plan or (v_redemption.plan_ended_at is not null and v_current_plan = 'free')) then
    update public.workspaces set plan = p_plan where id = v_redemption.redeemed_workspace_id;
  end if;

  if v_moving then
    return jsonb_build_object('status', 'updated', 'moved_takes', v_granted, 'revoked_takes', 0, 'granted_takes', 0);
  end if;
  return jsonb_build_object('status', 'updated', 'moved_takes', 0, 'revoked_takes', v_revoked, 'granted_takes', v_granted);
end;
$$;

revoke all on function public.admin_update_voucher_redemption(uuid, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.admin_update_voucher_redemption(uuid, text, timestamptz, boolean) to service_role;

commit;
