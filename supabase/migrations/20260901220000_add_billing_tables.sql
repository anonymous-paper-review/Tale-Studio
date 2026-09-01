-- 결제 준비 phase-2 슬라이스 1 (#payments-phase-2, v4 요금제 시트) — 빌링 스키마 신설.
--   결제(MoR) 연동 없이 완결되는 단계: 스키마 + 잔액 조회 + grant/manual_adjust 삽입 경로만.
--   hold/consume 파이프라인 배선과 만기 정산 잡은 다음 슬라이스(이 스키마가 그대로 수용).
--
-- 잔액 갱신 정책 — UPDATE 금지, 원장(ledger) 행 삽입 + 합산만 (v4 6_소멸시효, ref: gen-quota-atomic-gate).
--   2026-09-01 실측: 잔액 컬럼 UPDATE 방식은 동시 차감 경쟁에서 오버슛 11 을 냈다. 원장 삽입은
--   append-only 라 경쟁 자체가 없고, 환불도 음수 delta 행 추가로 표현돼 절대 음수 잔액 컬럼이
--   생기지 않는다.

-- 1) billing_customers — MoR(Merchant of Record) 고객 매핑. 워크스페이스 1:1.
create table public.billing_customers (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  mor_provider text,
  mor_customer_id text unique,
  created_at timestamptz not null default now()
);

-- 2) billing_events — MoR 웹훅 원본. mor_event_id 는 멱등성 키(웹훅 재전송 중복 방어, 다음 슬라이스가 소비).
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  mor_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- 3) subscriptions — 워크스페이스당 현재 구독 상태 스냅샷(MoR 측 진실의 로컬 사본).
create table public.subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  mor_subscription_id text unique,
  plan text not null,
  status text not null,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- 4) take_ledger — Take 잔액의 유일한 진실. 잔액 = sum(delta). UPDATE 금지, INSERT-only.
--   grant 계열(적립, delta>0 강제): grant_free/grant_plan/grant_purchase/grant_bonus.
--   반환(delta>0 강제): hold_release — 생성 실패 시 hold 를 되돌리는 행. 차감이 아니라 복원이다
--     (grant_id 로 같은 lot 을 가리켜 hold 와 쌍을 이룬다).
--   차감 계열(소비, delta<0 강제): hold/consume/expire/refund_revoke.
--   manual_adjust(관리자 수동 조정)만 증액·회수 양방향이라 부호 강제 대상에서 제외한다
--     (아래 CHECK 제약 두 개 모두 이 kind 를 대상에서 뺀다).
--   lot 추적(v4 2_Take경제): 차감 계열 행은 grant_id 로 소진 대상 grant 행을 가리킨다. 한 번의
--     소비가 여러 grant 에 걸치면(FIFO) 호출자가 grant 별로 행을 쪼개 여러 번 삽입한다.
create table public.take_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  delta integer not null check (delta <> 0),
  kind text not null check (kind in (
    'grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus',
    'hold', 'hold_release', 'consume', 'expire', 'refund_revoke', 'manual_adjust'
  )),
  grant_id uuid references public.take_ledger(id),
  expires_at timestamptz,
  ref_kind text,
  ref_id text,
  reason text,
  created_at timestamptz not null default now(),
  -- manual_adjust 는 관리자 감사 조정(증액·회수 양방향)이라 부호 강제 대상에서 제외한다 —
  --   나머지 grant 계열/차감 계열만 부호를 엄격히 강제.
  constraint take_ledger_grant_delta_positive check (
    kind not in ('grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus', 'hold_release') or delta > 0
  ),
  constraint take_ledger_debit_delta_negative check (
    kind not in ('hold', 'consume', 'expire', 'refund_revoke') or delta < 0
  )
);

create index take_ledger_workspace_created_idx on public.take_ledger (workspace_id, created_at);
create index take_ledger_grant_id_idx on public.take_ledger (grant_id);
create index billing_events_received_at_idx on public.billing_events (received_at);

-- RLS — 전 테이블 활성화 + 클라이언트 정책 없음(service-role 전용, deny-all).
--   빌링 원장·구독·웹훅은 서버(관리자 클라이언트)만 다룬다. service_role 은 RLS 를 우회하므로
--   정책 부재가 곧 "브라우저에서 절대 접근 불가"를 뜻한다.
alter table public.billing_customers enable row level security;
alter table public.billing_events    enable row level security;
alter table public.subscriptions     enable row level security;
alter table public.take_ledger       enable row level security;
