// 결제 게이트 공짜 검사 목록과 판정 (#payments-phase-3 P10). 약속: tests/billing/smoke-checks.test.ts.
//
//   돈 드는 검사(실결제 + 영상 생성, 1회 $0.31)와 나눈 쪽이다. 여기는 결제 없이 API 응답만 보고
//   "게이트가 살아 있나"를 판정한다 — 배포마다 돌려도 $0.
//   실제 호출은 scripts/smoke-billing.mjs 가 브라우저(로그인 세션) 안에서 한다. 이 파일은 목록과 판정만 갖는다.
//
//   왜 브라우저 안에서 부르나: 우리 API 는 Supabase SSR 쿠키로 로그인을 본다. 그 쿠키는 브라우저가 만든다.
//   스크립트가 직접 만들려면 쿠키 인코딩을 흉내내야 하고, 그건 Supabase 가 바꾸면 조용히 깨진다.

export interface CheckResponse {
  status: number
  body: unknown
}

export interface SmokeCheck {
  id: string
  title: string
  /** 이 검사가 지키는 것. 실패했을 때 무엇이 뚫린 건지 바로 읽히게. */
  guards: string
  method: 'GET' | 'POST'
  path: string
  body?: Record<string, unknown>
  /** 로그인 세션 없이 부른다(로그인 게이트 자체를 보는 검사). */
  anonymous?: boolean
  /** 이 조건이 아닌 계정에서는 판정이 성립하지 않아 건너뛴다. 스크립트가 계정 상태를 보고 판단한다. */
  onlyWhen?: 'free-plan-with-purchase' 
  judge: (res: CheckResponse) => boolean
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

export const BILLING_SMOKE_CHECKS: SmokeCheck[] = [
  {
    id: 'free-pack-limit',
    title: '무료 플랜이 팩을 두 번째 사려 하면 막힌다', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    guards: 'v4 충전 상한의 앞문. 뚫리면 돈은 받은 뒤라 웹훅 경보밖에 안 남는다', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    method: 'POST',
    path: '/api/billing/checkout',
    body: { kind: 'pack', id: 'mini' },
    // 이 검사는 무료 플랜 + 구매 이력이 있는 계정에서만 뜻이 있다. 구독 중인 계정에서는 200 이 정상이라
    //   판정이 성립하지 않는다 — 그래서 스크립트가 계정 상태를 먼저 보고 건너뛴다(skip). 여기서는 "무료인데 200" 을
    //   실패로 잡는 것만 한다. 앞문이 뚫렸다는 뜻이고, 그때는 돈을 이미 받은 뒤라 웹훅 경보밖에 안 남는다.
    onlyWhen: 'free-plan-with-purchase',
    judge: (r) => r.status === 409 && asRecord(r.body).error === 'free_pack_limit',
  },
  {
    id: 'checkout-requires-login',
    title: '로그인 없이 결제를 시도하면 거부한다', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    guards: '남의 워크스페이스에 적립되는 경로', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    method: 'POST',
    path: '/api/billing/checkout',
    body: { kind: 'pack', id: 'mini' },
    anonymous: true,
    judge: (r) => r.status === 401,
  },
  {
    id: 'webhook-rejects-unsigned',
    title: '서명 없는 웹훅은 거부한다', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    guards: '위조 알림으로 공짜 Take', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    method: 'POST',
    path: '/api/billing/paddle/webhook',
    body: { event_id: 'evt_smoke', event_type: 'transaction.completed', data: { id: 'txn_smoke' } },
    anonymous: true,
    judge: (r) => r.status === 401,
  },
  {
    id: 'cron-expire-guarded',
    title: '만료 잡 경로는 인증 없이 못 부른다', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    guards: '아무나 남의 Take 를 만료시키는 것', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    method: 'GET',
    path: '/api/cron/take-expire',
    anonymous: true,
    judge: (r) => r.status === 401,
  },
  {
    id: 'cron-reconcile-guarded',
    title: '대사 잡 경로는 인증 없이 못 부른다', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    guards: '아무나 Paddle 호출을 낭비시키고 남의 장부를 훑는 것', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    method: 'GET',
    path: '/api/cron/billing-reconcile',
    anonymous: true,
    judge: (r) => r.status === 401,
  },
  {
    id: 'account-summary',
    title: '계정 요약이 잔액·플랜과 함께 온다', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    guards: '유저가 잔액·플랜·영수증을 보는 유일한 화면', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    method: 'GET',
    path: '/api/billing/account',
    judge: (r) => {
      if (r.status !== 200) return false
      const body = asRecord(r.body)
      const sub = asRecord(body.subscription)
      // balance 는 admin(무제한)이면 null 이다. subscription 은 항상 있어야 한다.
      return typeof sub.plan === 'string' && typeof sub.status === 'string' && 'balance' in body
    },
  },
  {
    id: 'catalog-purchasable',
    title: '상품 대응표에 살아 있는 결제 버튼이 있다', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    guards: '가격 ID 가 배포 env 에 안 들어가 결제 버튼이 전부 죽는 것(라이브 전환 직후 최다 사고)', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    method: 'GET',
    path: '/api/billing/catalog-status',
    judge: (r) => r.status === 200 && typeof asRecord(r.body).purchasable === 'number' && (asRecord(r.body).purchasable as number) > 0,
  },
  {
    id: 'portal-opens',
    title: '고객 포털 주소가 열린다', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    guards: '유저가 스스로 구독을 취소하는 유일한 길', // i18n-ok: 스모크 터미널 출력, 유저 화면 아님
    method: 'POST',
    path: '/api/billing/portal',
    // 결제 이력이 없는 계정은 409 no_customer 가 정상이다. 500 은 실패.
    judge: (r) =>
      (r.status === 200 && typeof asRecord(r.body).overviewUrl === 'string') ||
      (r.status === 409 && asRecord(r.body).error === 'no_customer'),
  },
]

export interface CheckResult {
  id: string
  title: string
  ok: boolean
  detail: string
}

export function judgeCheck(check: SmokeCheck, res: CheckResponse): CheckResult {
  const ok = check.judge(res)
  const bodyPreview = typeof res.body === 'object' ? JSON.stringify(res.body).slice(0, 120) : String(res.body)
  return { id: check.id, title: check.title, ok, detail: `${res.status} ${bodyPreview}` }
}

export function summarize(results: readonly CheckResult[]): { ok: boolean; passed: number; failed: CheckResult[] } {
  const failed = results.filter((r) => !r.ok)
  return { ok: failed.length === 0, passed: results.length - failed.length, failed }
}
