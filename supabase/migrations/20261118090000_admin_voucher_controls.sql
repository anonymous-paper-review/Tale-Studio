begin;

alter table public.vouchers
  add column duration_days integer not null default 30 check (duration_days between 1 and 3650),
  add column active boolean not null default true,
  add column deleted_at timestamptz;

alter table public.voucher_redemptions
  add column plan text;

update public.voucher_redemptions r
   set plan = v.plan
  from public.vouchers v
 where v.code = r.code and r.plan is null;

alter table public.voucher_redemptions
  alter column plan set not null,
  add constraint voucher_redemptions_plan_check
    check (plan in ('s1', 's2', 's5', 's10', 'p10', 'p15', 'p20', 'p25', 'p30'));

comment on column public.vouchers.duration_days is
  '등록 시점부터 바우처 요금제와 Take가 유효한 일수. 기본 30일이며 관리자가 바꿀 수 있다.';
comment on column public.vouchers.active is
  'false면 새 등록을 막는다. 이미 등록된 계정은 각 등록 종료일까지 유지한다.';
comment on column public.vouchers.deleted_at is
  '삭제 시각. 기록은 보존하고 연결된 사용자의 유료 권한은 즉시 끝낸다.';
comment on column public.voucher_redemptions.plan is
  '이 등록 계정에 실제 적용한 플랜. 바우처 기본 플랜이 바뀌어도 만료 처리를 정확히 한다.';

create or replace function public.redeem_voucher(
  p_code text,
  p_workspace uuid,
  p_user uuid,
  p_plan text,
  p_takes integer,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_voucher public.vouchers%rowtype;
  v_workspace_plan text;
  v_uses integer;
  v_redemption uuid;
begin
  select * into v_voucher from public.vouchers where code = p_code for update;
  if not found or not v_voucher.active or v_voucher.deleted_at is not null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_voucher.plan is distinct from p_plan then
    raise exception 'redeem_voucher: plan mismatch for voucher (expected %, found %)', p_plan, v_voucher.plan;
  end if;

  if exists (
    select 1 from public.voucher_redemptions where code = p_code and redeemed_workspace_id = p_workspace
  ) then
    return jsonb_build_object('status', 'used');
  end if;
  select count(*) into v_uses from public.voucher_redemptions where code = p_code;
  if v_uses >= v_voucher.max_uses then
    return jsonb_build_object('status', 'used');
  end if;

  select plan into v_workspace_plan from public.workspaces where id = p_workspace for update;
  if not found then
    raise exception 'redeem_voucher: workspace % not found', p_workspace;
  end if;
  if v_workspace_plan is distinct from 'free' then
    return jsonb_build_object('status', 'not_free', 'plan', v_workspace_plan);
  end if;

  insert into public.voucher_redemptions (code, redeemed_by, redeemed_workspace_id, plan_ends_at, plan)
  values (p_code, p_user, p_workspace, p_expires_at, v_voucher.plan)
  returning id into v_redemption;

  update public.workspaces set plan = v_voucher.plan where id = p_workspace;

  if p_takes is not null and p_takes > 0 then
    insert into public.take_ledger (workspace_id, delta, kind, expires_at, ref_kind, ref_id, reason)
    values (p_workspace, p_takes, 'grant_plan', p_expires_at, 'voucher_redemption', v_redemption::text, 'voucher -> ' || v_voucher.plan);
  end if;

  return jsonb_build_object('status', 'ok', 'plan', v_voucher.plan, 'takes', greatest(coalesce(p_takes, 0), 0));
end;
$$;

create or replace function public.voucher_plan_expire_due()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_reverted integer := 0;
  v_kept integer := 0;
begin
  for v_row in
    select r.id, r.plan, r.redeemed_workspace_id as workspace_id
      from public.voucher_redemptions r
     where r.plan_ends_at <= now()
       and r.plan_ended_at is null
     order by r.plan_ends_at
     for update of r skip locked
  loop
    update public.workspaces set plan = 'free'
     where id in (
       select w.id
         from public.workspaces w
        where w.id = v_row.workspace_id
          and w.plan = v_row.plan
          and not exists (
            select 1 from public.subscriptions s
             where s.workspace_id = w.id
               and s.status in ('active', 'trialing', 'past_due')
          )
          and not exists (
            select 1 from public.voucher_redemptions newer
             where newer.redeemed_workspace_id = w.id
               and newer.id <> v_row.id
               and newer.plan_ends_at > now()
          )
     );
    if found then
      v_reverted := v_reverted + 1;
    else
      v_kept := v_kept + 1;
    end if;

    update public.voucher_redemptions set plan_ended_at = now() where id = v_row.id;
  end loop;

  return jsonb_build_object('reverted', v_reverted, 'kept', v_kept);
end;
$$;

revoke all on function public.redeem_voucher(text, uuid, uuid, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.voucher_plan_expire_due() from public, anon, authenticated;

-- 관리자의 계정별 티어·기간 변경과 즉시 해지를 원장에 반영한다.
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
  v_entitlement_applied boolean := false;
  v_new_takes integer := 0;
  v_revoked integer := 0;
  v_row record;
begin
  if not p_revoke and (p_plan not in ('s1', 's2', 's5', 's10', 'p10', 'p15', 'p20', 'p25', 'p30') or p_ends_at is null) then
    raise exception 'invalid voucher entitlement';
  end if;
  select * into v_redemption from public.voucher_redemptions where id = p_redemption for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_redemption.redeemed_workspace_id is null then
    update public.voucher_redemptions set plan_ended_at = coalesce(plan_ended_at, now()) where id = v_redemption.id;
    return jsonb_build_object('status', 'ended');
  end if;
  select plan into v_current_plan from public.workspaces where id = v_redemption.redeemed_workspace_id for update;

  -- 기존 바우처 적립 중 아직 남은 Take만 회수한다. 사용한 Take 기록은 보존한다.
  for v_row in
    select g.id, g.workspace_id, g.delta + coalesce(sum(c.delta), 0) as remaining
      from public.take_ledger g
      left join public.take_ledger c on c.grant_id = g.id
     where ((g.ref_kind = 'voucher_redemption' and g.ref_id = p_redemption::text)
         or (g.ref_kind = 'voucher_admin_plan' and g.ref_id like p_redemption::text || ':%'))
       and g.kind = 'grant_plan'
     group by g.id, g.workspace_id, g.delta
  loop
    if v_row.remaining > 0 then
      insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
      values (v_row.workspace_id, -v_row.remaining, 'refund_revoke', v_row.id,
              'voucher_admin_revoke', v_row.id::text, 'voucher entitlement adjusted by admin');
      v_revoked := v_revoked + v_row.remaining;
    end if;
  end loop;

  if p_revoke or p_ends_at <= now() then
    if (v_current_plan = v_redemption.plan or (v_redemption.plan_ended_at is not null and v_current_plan = 'free')) and not exists (
      select 1 from public.subscriptions s where s.workspace_id = v_redemption.redeemed_workspace_id
        and s.status in ('active', 'trialing', 'past_due')
    ) and not exists (
      select 1 from public.voucher_redemptions newer where newer.redeemed_workspace_id = v_redemption.redeemed_workspace_id
        and newer.id <> v_redemption.id and newer.plan_ended_at is null and newer.plan_ends_at > now()
    ) then
      update public.workspaces set plan = 'free' where id = v_redemption.redeemed_workspace_id;
    end if;
    update public.voucher_redemptions set plan_ended_at = now() where id = v_redemption.id;
    return jsonb_build_object('status', 'ended', 'revoked_takes', v_revoked);
  end if;

  update public.voucher_redemptions set plan = p_plan, plan_ends_at = p_ends_at, plan_ended_at = null where id = v_redemption.id;
  v_entitlement_applied := (v_current_plan = v_redemption.plan or (v_redemption.plan_ended_at is not null and v_current_plan = 'free')) and not exists (
    select 1 from public.subscriptions s where s.workspace_id = v_redemption.redeemed_workspace_id
      and s.status in ('active', 'trialing', 'past_due')
  );
  if v_entitlement_applied then
    update public.workspaces set plan = p_plan where id = v_redemption.redeemed_workspace_id;
  end if;
  v_new_takes := case p_plan when 's1' then 16 when 's2' then 30 when 's5' then 60 when 's10' then 100
    when 'p10' then 150 when 'p15' then 200 when 'p20' then 360 when 'p25' then 410 when 'p30' then 710 else 0 end;
  if v_entitlement_applied and v_new_takes > 0 then
    insert into public.take_ledger (workspace_id, delta, kind, expires_at, ref_kind, ref_id, reason)
    values (v_redemption.redeemed_workspace_id, v_new_takes, 'grant_plan', p_ends_at,
      'voucher_admin_plan', p_redemption::text || ':' || gen_random_uuid()::text, 'voucher tier adjusted by admin -> ' || p_plan);
  end if;
  return jsonb_build_object('status', 'updated', 'revoked_takes', v_revoked, 'granted_takes', v_new_takes);
end;
$$;

create or replace function public.admin_end_voucher_redemption(p_redemption uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.admin_update_voucher_redemption(p_redemption, null, now(), true);
$$;

revoke all on function public.admin_update_voucher_redemption(uuid, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.admin_end_voucher_redemption(uuid) from public, anon, authenticated;
grant execute on function public.admin_update_voucher_redemption(uuid, text, timestamptz, boolean) to service_role;
grant execute on function public.admin_end_voucher_redemption(uuid) to service_role;

commit;
