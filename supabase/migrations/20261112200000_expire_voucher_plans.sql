-- 바우처 요금제가 끝나는 날(2026-11-12 오너): "바우처 등록일로부터 1달 지나면 다시 무료기능으로".
--   한 달 = 코드로 받은 Take 가 사라지는 30일과 같은 시각. 요금제와 Take 가 같은 날 끝난다.
--   이미 쓴 코드도 쓴 때(redeemed_at) + 30일로 끝나는 날을 정한다.
--   무료로 돌리는 일은 하루 한 번 예약 작업(/api/cron/voucher-expire)이 voucher_plan_expire_due() 로 한다.
--   돌리지 않는 경우: 그사이 구독을 시작한 계정 · 요금제가 코드 요금제와 달라진 계정 · 아직 끝나지 않은 다른 코드 요금제가 있는 계정.
--   약속: tests/billing/voucher.test.ts
begin;

alter table public.voucher_redemptions add column plan_ends_at timestamptz;
alter table public.voucher_redemptions add column plan_ended_at timestamptz;

comment on column public.voucher_redemptions.plan_ends_at is
  '코드 요금제가 끝나는 시각(쓴 때 + 30일, Take 만료와 같다). 한 사람만 늘려 주려면 이 값을 고친다.';
comment on column public.voucher_redemptions.plan_ended_at is
  '하루 한 번 정리 잡이 이 기록을 처리한 시각. 무료로 돌렸든 그대로 두었든 한 번만 처리한다.';

update public.voucher_redemptions
   set plan_ends_at = redeemed_at + interval '30 days'
 where plan_ends_at is null;

-- 코드 쓰기 — 20261029160000 과 같고, 쓴 기록에 끝나는 시각(p_expires_at = Take 만료 시각)을 같이 적는다.
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
  if not found then
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

  insert into public.voucher_redemptions (code, redeemed_by, redeemed_workspace_id, plan_ends_at)
  values (p_code, p_user, p_workspace, p_expires_at)
  returning id into v_redemption;

  update public.workspaces set plan = v_voucher.plan where id = p_workspace;

  if p_takes is not null and p_takes > 0 then
    insert into public.take_ledger (workspace_id, delta, kind, expires_at, ref_kind, ref_id, reason)
    values (p_workspace, p_takes, 'grant_plan', p_expires_at, 'voucher_redemption', v_redemption::text, 'voucher -> ' || v_voucher.plan);
  end if;

  return jsonb_build_object('status', 'ok', 'plan', v_voucher.plan, 'takes', greatest(coalesce(p_takes, 0), 0));
end;
$$;

revoke all on function public.redeem_voucher(text, uuid, uuid, text, integer, timestamptz) from public, anon, authenticated;

-- 끝나는 시각이 지난 코드 요금제 정리 — 한 기록씩: 계정을 무료로 돌릴 수 있으면 돌리고, 기록에 처리 시각을 남긴다.
--   skip locked: 같은 시각에 두 번 불려도 한 기록은 한 쪽만 처리한다.
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
    select r.id, r.code, r.redeemed_workspace_id as workspace_id
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
         join public.vouchers v on v.code = v_row.code
        where w.id = v_row.workspace_id
          and w.plan = v.plan
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

revoke all on function public.voucher_plan_expire_due() from public, anon, authenticated;

commit;
