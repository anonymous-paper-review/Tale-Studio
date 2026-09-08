-- 결제 phase-3 P14+P13 (#payments-phase-3) — 장부의 두 구멍을 막는다.
--   문제 정의: .claude/docs/2026-09-08/ledger-two-holes.html (3판)
--   약속: .claude/docs/2026-09-07/paddle-promises.md §P14 §P13
--
-- 구멍 1 (P14) 같은 결제로 Take 가 두 번 들어간다.
--   웹훅 재전송이 서버 두 대에 동시에 떨어지면 조회(hasGrant)는 둘 다 "없다" 를 받는다. 조회와 삽입 사이가
--   원자적이지 않아 앱 코드로는 못 막는다. 판정자가 하나인 자리는 DB 뿐이라 유일 인덱스로 막는다.
--
-- 구멍 2 (P13) 만료일이 지난 Take 가 사라지지 않는다.
--   ① take_hold 가 만료된 lot 을 건너뛴다(생성 게이트에서 새는 창 0) ② take_expire_due() 가 만료 행을 남긴다(기록·정리).
--   잔액 표시 쪽 제외는 앱 코드(account-summary.takeBreakdown)가 한다.

-- ── 1) 이중 적립 방어 (P14) ──────────────────────────────────────────────────
-- 적립·회수는 (ref_kind, ref_id, kind) 조합이 한 줄뿐이다. 결제 번호만으로 걸지 않는 이유: 같은 결제에
--   적립 행(grant_purchase)과 환불 회수 행(refund_revoke)이 둘 다 붙어야 한다.
-- hold/hold_release/consume 은 대상이 아니다 — 한 영상에 lot 마다 한 줄씩 여러 줄이 정상이다.
-- 부분 인덱스라 ref_id 가 null 인 행(관리자 수동 적립 등)은 제약을 안 받는다.

-- 제약을 걸기 전에 기존 중복을 확인한다. 있으면 여기서 멈추고 목록을 예외 메시지로 보여준다
--   (live 장부에 중복이 있는 채로 인덱스를 만들면 마이그레이션 자체가 알아보기 어려운 에러로 실패한다).
do $$
declare
  v_dups text;
begin
  select string_agg(format('%s/%s/%s x%s', ref_kind, ref_id, kind, cnt), ', ')
    into v_dups
  from (
    select ref_kind, ref_id, kind, count(*) as cnt
    from public.take_ledger
    where ref_id is not null
      and kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus', 'refund_revoke')
    group by ref_kind, ref_id, kind
    having count(*) > 1
  ) d;

  if v_dups is not null then
    raise exception 'take_ledger 에 이미 중복 적립/회수가 있다. 유일 인덱스를 걸기 전에 정리해야 한다: %', v_dups;
  end if;
end $$;

create unique index take_ledger_ref_grant_unique
  on public.take_ledger (ref_kind, ref_id, kind)
  where ref_id is not null
    and kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus', 'refund_revoke');

-- ── 2) 생성 게이트에서 만료 lot 제외 (P13) ──────────────────────────────────
-- take_hold 의 lot 순회에 "만료 안 된 것만" 조건을 넣는다. 잡이 아직 안 돌았어도 만료된 Take 로는
--   영상 생성을 시작할 수 없다. 잔액 계산(v_balance)도 같은 기준으로 맞춘다 — 화면에 없는 Take 가
--   게이트만 통과하면 "잔액 0 인데 생성됨" 이 된다.
create or replace function public.take_hold(
  p_workspace uuid,
  p_amount integer,
  p_job uuid,
  p_enforce boolean
) returns jsonb
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

  -- 잔액 = 살아 있는 lot 의 남은 양 합 + grant 에 안 묶인 행(수동 조정·환불 회수 등).
  --   만료된 lot 의 남은 양은 0 으로 친다(P13 읽을 때 제외). 만료 행이 이미 들어간 lot 은 남은 양이
  --   0 이라 두 번 빠지지 않는다.
  select coalesce(sum(live.remaining), 0) into v_balance
  from (
    select case
             when g.expires_at is not null and g.expires_at <= now() then 0
             else g.delta + coalesce((select sum(c.delta) from public.take_ledger c where c.grant_id = g.id), 0)
           end as remaining
    from public.take_ledger g
    where g.workspace_id = p_workspace
      and g.kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
    union all
    select o.delta
    from public.take_ledger o
    where o.workspace_id = p_workspace
      and o.kind not in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
      and o.grant_id is null
  ) live;

  if p_enforce and v_balance < p_amount then
    return jsonb_build_object('ok', false, 'balance', v_balance, 'held', 0, 'insufficient', true);
  end if;

  v_remaining := p_amount;

  -- lot 배분: grant_* 행을 소진 순서(kind 우선순위 → created_at FIFO)로 순회하며 잔여만큼 hold.
  --   만료된 lot 은 건너뛴다.
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
      and (tl.expires_at is null or tl.expires_at > now())
    order by kind_order asc, tl.created_at asc, tl.id asc
  loop
    exit when v_remaining <= 0;

    select v_grant.delta + coalesce(sum(child.delta), 0) into v_grant_remaining
    from public.take_ledger child
    where child.grant_id = v_grant.id;

    continue when v_grant_remaining <= 0;

    v_take := least(v_grant_remaining, v_remaining);

    insert into public.take_ledger (workspace_id, delta, kind, grant_id, ref_kind, ref_id, reason)
    values (p_workspace, -v_take, 'hold', v_grant.id, 'generation_job', p_job::text, 'take_hold');

    v_held := v_held + v_take;
    v_remaining := v_remaining - v_take;
  end loop;

  -- shadow 모드(p_enforce=false)에서 잔액이 모자라면 배분하지 못한 나머지를 lot 없는 hold 로 기록한다.
  if v_remaining > 0 then
    insert into public.take_ledger (workspace_id, delta, kind, ref_kind, ref_id, reason)
    values (p_workspace, -v_remaining, 'hold', 'generation_job', p_job::text, 'take_hold (unallocated)');
    v_held := v_held + v_remaining;
  end if;

  return jsonb_build_object('ok', true, 'balance', v_balance, 'held', v_held, 'insufficient', false);
end;
$$;

-- ── 3) 만료 잡 (P13) ────────────────────────────────────────────────────────
-- 만료일이 지난 lot 의 남은 양만큼 expire 행을 넣는다. 남은 양이 0 이하인 lot 은 건너뛰므로 두 번 돌아도
--   두 번 만료되지 않는다(멱등). 잡 두 개가 동시에 도는 경우는 advisory lock 으로 막는다.
--   잡아둔(hold) 만큼은 이미 남은 양에서 빠져 있어 뺏지 않는다 — 생성이 실패해 돌아오면 다음 잡이 만료시킨다.
create or replace function public.take_expire_due()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grant record;
  v_remaining integer;
  v_lots integer := 0;
  v_takes integer := 0;
begin
  -- 잡 전체를 한 줄로 세운다(Cron 겹침·수동 재실행 대비).
  perform pg_advisory_xact_lock(hashtext('take_expire_due'));

  for v_grant in
    select tl.id, tl.workspace_id, tl.delta
    from public.take_ledger tl
    where tl.kind in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus')
      and tl.expires_at is not null
      and tl.expires_at <= now()
    order by tl.created_at asc, tl.id asc
  loop
    select v_grant.delta + coalesce(sum(child.delta), 0) into v_remaining
    from public.take_ledger child
    where child.grant_id = v_grant.id;

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
