// Take hold 서버 래퍼 (#payments-phase-2, #gen-quota-atomic-gate) — 생성 진입 라우트가
//   원자 hold RPC(take_hold/take_release_for_job, 20260902150000)를 부르는 유일한 경로.
//
// 단계적 활성화(오너 확정) — env TAKE_BILLING_MODE:
//   off(기본)    — 아무것도 안 한다. 코드 기본값이 off 라 이 슬라이스는 배포해도 무해하다.
//   shadow       — hold/release 는 기록하되 잔액 부족이어도 통과시킨다(RPC 에 enforce=false —
//                  음수 잔액 허용, 실측/청구 정합성 관측용).
//   enforce      — 잔액 부족이면 생성 자체를 차단한다(RPC 에 enforce=true).
//
// admin = 슈퍼계정(2026-09-02 오너 결정): admin 워크스페이스는 hold/차감/부족 차단을 전부
//   건너뛴다. 판정은 generation-quota.ts 의 admin 면제와 같은 축(src/lib/admin.ts) 재사용.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin'

export type TakeBillingMode = 'off' | 'shadow' | 'enforce'

const TAKE_BILLING_MODES: readonly TakeBillingMode[] = ['off', 'shadow', 'enforce']

/** env TAKE_BILLING_MODE 읽기 — 미설정·미지 값은 안전측 기본값 'off'로 떨어진다. */
export function takeBillingMode(): TakeBillingMode {
  const raw = process.env.TAKE_BILLING_MODE
  return TAKE_BILLING_MODES.includes(raw as TakeBillingMode) ? (raw as TakeBillingMode) : 'off'
}

export interface HoldResult {
  ok: boolean
  insufficient: boolean
  held: number
  balance: number
  /** 이 hold 가 실제로 RPC 를 타지 않고 스킵된 이유. null = RPC 를 탔다. */
  skipped: 'off' | 'admin' | null
}

// admin 판별 캐시 — generation-quota.ts 의 동일 패턴(핫패스에서 auth 조회 유저당 1회로 축소).
const adminUserCache = new Map<string, boolean>()

async function isAdminUserId(userId: string): Promise<boolean> {
  const cached = adminUserCache.get(userId)
  if (cached !== undefined) return cached
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (error) throw error
    const admin = isAdminEmail(data?.user?.email)
    adminUserCache.set(userId, admin)
    return admin
  } catch {
    // 판별 실패는 일반 유저로 취급 — admin 면제가 잘못 걸리는 쪽(과금)이 뚫리는 쪽보다 안전.
    return false
  }
}

/**
 * 영상 생성 잡 제출 직전에 부르는 원자 hold 관문. mode=off 는 RPC 를 아예 타지 않고
 * 무제한 통과로 취급(ok:true, insufficient:false) — 배포해도 기존 동작이 그대로다.
 */
export async function holdTakesForVideoJob(input: {
  workspaceId: string
  userId: string
  jobId: string
  amount: number
}): Promise<HoldResult> {
  const mode = takeBillingMode()
  if (mode === 'off') {
    return { ok: true, insufficient: false, held: 0, balance: 0, skipped: 'off' }
  }
  if (await isAdminUserId(input.userId)) {
    return { ok: true, insufficient: false, held: 0, balance: 0, skipped: 'admin' }
  }
  const { data, error } = await supabaseAdmin.rpc('take_hold', {
    p_workspace: input.workspaceId,
    p_amount: input.amount,
    p_job: input.jobId,
    p_enforce: mode === 'enforce',
  })
  if (error) throw error
  const result = data as { ok: boolean; balance: number; held: number; insufficient: boolean }
  return { ok: result.ok, insufficient: result.insufficient, held: result.held, balance: result.balance, skipped: null }
}

/**
 * 영상 잡이 터미널 실패(failed/cancelled)로 마킹된 뒤 부르는 반환. mode=off 여도 실행한다 —
 * mode 를 shadow/enforce 로 켰다가 다시 off 로 내린 과거 잡의 hold 가 남아있을 수 있어, RPC 의
 * 멱등성(이미 전액 반환이면 0)에 그대로 위임한다. hold 가 없던 잡(이미지·mode=off 시절 영상)도
 * 이 잡의 hold 행이 없으니 RPC 가 0 을 반환할 뿐 안전하다.
 */
export async function releaseTakesForJob(jobId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('take_release_for_job', { p_job: jobId })
  if (error) throw error
  return (data as number | null) ?? 0
}
