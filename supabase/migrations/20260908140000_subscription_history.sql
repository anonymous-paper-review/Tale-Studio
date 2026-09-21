-- 구독 행을 "워크스페이스당 하나" 에서 "구독 하나당 한 행 + 활성은 워크스페이스당 하나" 로 (#payments-phase-3).
--
-- 왜 (2026-09-08 실제 사고):
--   subscriptions.workspace_id 가 기본키라 워크스페이스당 행이 물리적으로 하나뿐이었다. 그래서
--   upsert(onConflict: workspace_id) 가 새 구독으로 옛 구독을 **덮어썼다**. 스모크가 만든 가짜 구독이
--   진짜 구독 행을 덮어쓰고, 정리 단계에서 가짜 ID 로 지우니 덮어쓰인 진짜 행이 함께 사라졌다 —
--   Paddle 에는 구독이 살아 있는데 우리 DB 에는 없는 상태. 스크립트를 고치는 것으로는 같은 사고가 또 난다
--   (덮어쓰기가 가능한 구조 자체가 원인이다).
--
-- 무엇이 바뀌나:
--   ① 기본키를 mor_subscription_id 로 옮긴다 — 구독 하나당 한 행. 새 구독이 옛 구독을 못 덮어쓴다.
--   ② 활성 구독은 워크스페이스당 하나만 (부분 유일 인덱스). 이중 구독은 여전히 막힌다.
--   ③ 취소하고 다시 구독한 이력이 남는다 — "그때 무슨 플랜이었나" 에 답할 수 있다(환불·분쟁 근거).
--
-- 읽는 쪽 영향: workspace_id 로 maybeSingle() 하던 곳이 여러 행을 받을 수 있다. 그래서 앱 코드는
--   pickActiveSubscription(src/lib/billing/subscription-state.ts) 을 거치게 바꿨다.

-- 기존 행에 mor_subscription_id 가 없으면(수동 삽입 등) 기본키를 못 옮긴다. 그런 행을 먼저 확인한다.
do $$
declare
  v_null_ids integer;
begin
  select count(*) into v_null_ids from public.subscriptions where mor_subscription_id is null;
  if v_null_ids > 0 then
    raise exception 'subscriptions 에 mor_subscription_id 가 비어 있는 행이 % 개 있다. 채우거나 지운 뒤 다시 실행하라.', v_null_ids;
  end if;
end $$;

alter table public.subscriptions drop constraint subscriptions_pkey;
alter table public.subscriptions drop constraint subscriptions_mor_subscription_id_key;
alter table public.subscriptions alter column mor_subscription_id set not null;
alter table public.subscriptions add primary key (mor_subscription_id);

-- 활성 구독은 워크스페이스당 하나. 이 인덱스가 이중 구독을 막는 자리다(결제창 앞 판정의 최후 방어).
--   past_due 는 갱신 실패라 아직 살아 있는 구독으로 본다 — 그 상태에서 새 구독을 또 만들면 이중 청구다.
create unique index subscriptions_one_live_per_workspace
  on public.subscriptions (workspace_id)
  where status in ('active', 'trialing', 'past_due');

-- 이력 조회용. 워크스페이스의 지난 구독을 최근 순으로.
create index subscriptions_workspace_updated on public.subscriptions (workspace_id, updated_at desc);
