-- 바우처 코드(2026-10-27 오너): 아이디 · 비밀번호를 나눠 주던 테스트 계정 대신 코드를 준다.
--   구글로 로그인한 사용자가 계정 화면에 코드를 넣으면 그 요금제와 한 달 Take 가 들어온다. 코드 하나는 한 명만 쓴다.
--   코드는 scripts/create-vouchers.mjs 가 만든다. 쓰기 판정은 redeem_voucher 한 곳에서 잠금을 걸고 한다.
--   약속: tests/billing/voucher.test.ts
begin;

create table public.vouchers (
  -- 저장 모양은 대문자 · 숫자만(하이픈 없음). 화면 · 목록에는 TALE-XXXX-XXXX 로 보인다.
  code text primary key check (code ~ '^[A-Z0-9]{8,32}$'),
  plan text not null check (plan in ('s1', 's2', 's5', 's10', 'p10', 'p15', 'p20', 'p25', 'p30')),
  note text,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  -- 쓴 사람 · 작업 공간을 지워도 "이미 쓴 코드"는 남는다(redeemed_at 이 판정 기준).
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_workspace_id uuid references public.workspaces(id) on delete set null
);

comment on table public.vouchers is
  '바우처 코드(2026-10-27): 코드 하나 = 요금제 하나 · 한 명. redeemed_at 이 있으면 쓴 코드. 서버(service role)만 읽고 쓴다.';

-- 클라이언트 정책 없음 = 브라우저에서 코드 목록을 읽을 수 없다(service role 만).
alter table public.vouchers enable row level security;

-- 코드 쓰기 — 한 트랜잭션: 코드 잠금 → 작업 공간 잠금 → 무료 확인 → 쓴 표시 · 요금제 · Take.
--   p_plan 은 호출자가 먼저 읽은 코드의 요금제다(Take 수를 앱의 요금제 표로 계산하려고). 다르면 멈춘다.
--   Take 는 (ref_kind='voucher', ref_id=코드, grant_plan) 유일 인덱스로 같은 코드에 두 번 들어가지 않는다.
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
begin
  select * into v_voucher from public.vouchers where code = p_code for update;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_voucher.redeemed_at is not null then
    return jsonb_build_object('status', 'used');
  end if;
  if v_voucher.plan is distinct from p_plan then
    raise exception 'redeem_voucher: plan mismatch for voucher (expected %, found %)', p_plan, v_voucher.plan;
  end if;

  select plan into v_workspace_plan from public.workspaces where id = p_workspace for update;
  if not found then
    raise exception 'redeem_voucher: workspace % not found', p_workspace;
  end if;
  if v_workspace_plan is distinct from 'free' then
    return jsonb_build_object('status', 'not_free', 'plan', v_workspace_plan);
  end if;

  update public.vouchers
     set redeemed_at = now(), redeemed_by = p_user, redeemed_workspace_id = p_workspace
   where code = p_code;

  update public.workspaces set plan = v_voucher.plan where id = p_workspace;

  if p_takes is not null and p_takes > 0 then
    insert into public.take_ledger (workspace_id, delta, kind, expires_at, ref_kind, ref_id, reason)
    values (p_workspace, p_takes, 'grant_plan', p_expires_at, 'voucher', p_code, 'voucher -> ' || v_voucher.plan);
  end if;

  return jsonb_build_object('status', 'ok', 'plan', v_voucher.plan, 'takes', greatest(coalesce(p_takes, 0), 0));
end;
$$;

revoke all on function public.redeem_voucher(text, uuid, uuid, text, integer, timestamptz) from public, anon, authenticated;

commit;
