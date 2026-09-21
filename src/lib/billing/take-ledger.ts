// Take 원장(ledger) — 결제 준비 phase-2 슬라이스 1 (#payments-phase-2, v4 2_Take경제·6_소멸시효).
//
// 잔액은 컬럼 UPDATE 가 아니라 이 파일이 삽입하는 원장 행의 합산이다(gen-quota-atomic-gate 실측
//   오버슛 11 회피 — append-only 는 동시 차감 경쟁이 구조적으로 불가능하다).
//
// 이번 슬라이스 범위: 스키마 + 잔액 조회 + grant/manual_adjust 삽입 경로. hold/consume 생성
//   파이프라인 배선과 만기(expire) 정산 잡은 다음 슬라이스 — take_ledger 스키마는 이미 그 kind 들을
//   수용하지만, 이 파일은 grantTakes/manualAdjustTakes 만 제공한다.
//   부호 규약: grant_* 와 hold_release(반환)는 양수, hold/consume/expire/refund_revoke 는 음수,
//   manual_adjust 만 양방향 — DB CHECK 와 일치(20260901220000 마이그레이션).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { takeBreakdown, type LedgerRow } from '@/lib/billing/account-summary'

const GRANT_KINDS = ['grant_free', 'grant_plan', 'grant_purchase', 'grant_bonus'] as const
type GrantKind = (typeof GRANT_KINDS)[number]

/**
 * 워크스페이스의 현재 Take 잔액.
 * 만료일이 지난 lot 의 남은 양은 0 으로 친다 (#payments-phase-3 P13) — 만료 잡(Cron)이 만료 행을 넣기
 * 전에도 잔액에 안 잡히게. 잡을 기다리면 잡 주기만큼 새는 창이 생긴다(1시간 주기면 최악 59분).
 * 계산은 account-summary.takeBreakdown 과 같은 규칙이고, 화면·게이트가 같은 숫자를 보게 그 함수를 쓴다.
 */
export async function takeBalance(workspaceId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('take_ledger')
    .select('id, kind, delta, grant_id, expires_at, ref_kind, ref_id, reason, created_at')
    .eq('workspace_id', workspaceId)
  if (error) throw error
  return takeBreakdown((data ?? []) as LedgerRow[]).total
}

export interface GrantTakesInput {
  workspaceId: string
  amount: number
  kind: GrantKind
  expiresAt?: string
  refKind?: string
  refId?: string
  reason?: string
}

/**
 * Take 적립(grant_*) — 항상 양수 delta. amount<=0 은 DB CHECK 이전에 여기서 막아 원장에 잘못된
 * 행이 삽입되기 전에 실패시킨다(호출자 실수를 빠르게 드러낸다).
 */
export async function grantTakes(input: GrantTakesInput): Promise<{ id: string }> {
  if (!GRANT_KINDS.includes(input.kind)) {
    throw new Error(`grantTakes: invalid kind '${input.kind}' — must be a grant_* kind`)
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('grantTakes: amount must be a positive integer')
  }
  const { data, error } = await supabaseAdmin
    .from('take_ledger')
    .insert({
      workspace_id: input.workspaceId,
      delta: input.amount,
      kind: input.kind,
      expires_at: input.expiresAt ?? null,
      ref_kind: input.refKind ?? null,
      ref_id: input.refId ?? null,
      reason: input.reason ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id: data.id as string }
}

export interface ManualAdjustInput {
  workspaceId: string
  delta: number
  reason: string
  adminUserId: string
}

/**
 * 관리자 수동 조정(manual_adjust) — delta<0(회수)도 허용한다(호출부는 관리자 라우트로 한정).
 * reason·adminUserId 는 감사 로그 필수 — 비어 있으면 삽입 전 throw.
 */
export async function manualAdjustTakes(input: ManualAdjustInput): Promise<{ id: string }> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new Error('manualAdjustTakes: delta must be a non-zero integer')
  }
  if (!input.reason || !input.reason.trim()) {
    throw new Error('manualAdjustTakes: reason is required for audit')
  }
  if (!input.adminUserId) {
    throw new Error('manualAdjustTakes: adminUserId is required for audit')
  }
  const { data, error } = await supabaseAdmin
    .from('take_ledger')
    .insert({
      workspace_id: input.workspaceId,
      delta: input.delta,
      kind: 'manual_adjust',
      ref_kind: 'admin',
      ref_id: input.adminUserId,
      reason: input.reason,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id: data.id as string }
}
