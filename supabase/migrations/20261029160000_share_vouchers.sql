-- 여러 계정이 함께 쓰는 바우처 코드(2026-10-29 오너): s2 · p10 코드를 하나씩 만들어 여러 구글 계정이 같은 코드를 쓴다.
--   코드마다 쓸 수 있는 계정 수(max_uses)를 둔다. 이미 있던 코드는 1 — 10-27 에 만든 코드는 그대로 한 명만 쓴다.
--   "누가 썼나"는 코드 표의 칸 세 개로는 한 명밖에 못 적어서, 쓴 기록을 voucher_redemptions 로 옮긴다(한 번 쓸 때마다 한 줄).
--   한 계정(작업 공간)은 같은 코드를 한 번만 쓴다 — 무료로 돌아간 계정이 같은 코드로 Take 를 또 받지 않게.
--   Take 줄의 출처는 쓴 기록 한 줄이다(ref_kind='voucher_redemption'). 코드로 걸면 take_ledger_ref_grant_unique 가 두 번째 사람을 막는다.
--   약속: tests/billing/voucher.test.ts
begin;

alter table public.vouchers add column max_uses integer not null default 1 check (max_uses >= 1);

create table public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.vouchers(code),
  redeemed_at timestamptz not null default now(),
  -- 쓴 사람 · 작업 공간을 지워도 기록은 남아 자리 수에 계속 잡힌다.
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_workspace_id uuid references public.workspaces(id) on delete set null,
  unique (code, redeemed_workspace_id)
);

comment on table public.voucher_redemptions is
  '바우처 코드를 쓴 기록(2026-10-29): 한 번 쓸 때마다 한 줄. 코드의 max_uses 까지만 쌓인다. 서버(service role)만 읽고 쓴다.';

-- 클라이언트 정책 없음 = 브라우저에서 기록을 읽을 수 없다(service role 만).
alter table public.voucher_redemptions enable row level security;

insert into public.voucher_redemptions (code, redeemed_at, redeemed_by, redeemed_workspace_id)
select code, redeemed_at, redeemed_by, redeemed_workspace_id
  from public.vouchers
 where redeemed_at is not null;

alter table public.vouchers
  drop column redeemed_at,
  drop column redeemed_by,
  drop column redeemed_workspace_id;

comment on table public.vouchers is
  '바우처 코드(2026-10-27 · 10-29): 코드 하나 = 요금제 하나. max_uses 개 계정까지 쓰고, 쓴 기록은 voucher_redemptions. 서버(service role)만 읽고 쓴다.';

-- 코드 쓰기 — 한 트랜잭션: 코드 잠금 → 자리 세기 → 작업 공간 잠금 → 무료 확인 → 쓴 기록 · 요금제 · Take.
--   코드 줄을 잠그므로 같은 코드를 동시에 넣은 두 사람은 차례로 판정된다(마지막 자리는 한 명만).
--   p_plan 은 호출자가 먼저 읽은 코드의 요금제다(Take 수를 앱의 요금제 표로 계산하려고). 다르면 멈춘다.
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

  insert into public.voucher_redemptions (code, redeemed_by, redeemed_workspace_id)
  values (p_code, p_user, p_workspace)
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

commit;
