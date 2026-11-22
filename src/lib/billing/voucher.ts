// 바우처 코드(2026-10-27 오너): 아이디 · 비밀번호를 나눠 주던 테스트 계정 대신 코드를 준다.
//   구글로 로그인한 사용자가 계정 화면에 코드를 넣으면 그 요금제와 한 달 Take 가 들어온다.
//   코드마다 쓸 수 있는 계정 수가 있고(10-27 코드는 1, 10-29 공용 코드는 여러 명), 한 계정은 같은 코드를 한 번만 쓴다.
//   코드 요금제는 쓴 때로부터 30일 뒤 무료로 돌아간다(11-12) — Take 만료와 같은 시각, 정리는 /api/cron/voucher-expire.
//   코드는 scripts/create-vouchers.mjs 가 만들어 vouchers 표(서버만 읽음)에 넣고, 쓰기는 DB 함수 redeem_voucher 한 곳이 판정한다.
//   약속: tests/billing/voucher.test.ts
import { getPlanEntitlements } from '@/lib/plan-limits'

/** 코드로 받은 Take 와 코드 요금제가 살아 있는 날 수. 결제가 없어 매달 다시 채워지지 않으므로 한 달치를 한 번 주고, 같은 날 요금제도 끝난다. */
export const VOUCHER_TAKES_VALID_DAYS = 30

export interface VoucherUseCapacity {
  active: boolean
  deletedAt: string | null
  used: number
  maxUses: number
}

export function voucherCanBeUsed(input: VoucherUseCapacity): boolean {
  return input.active && input.deletedAt === null && input.used < input.maxUses
}

/** 정리한 코드 모양(대문자 · 숫자). 만드는 코드는 TALE + 8자이고, DB 제약도 같은 범위다. */
export const VOUCHER_CODE_PATTERN = /^[A-Z0-9]{8,32}$/

export type VoucherFailure = 'invalid' | 'used' | 'not_free'

/** 받은 사람이 옮겨 적은 코드를 저장 모양으로 — 대소문자 · 띄어쓰기 · 하이픈을 가리지 않는다. */
export function normalizeVoucherCode(input: unknown): string {
  return typeof input === 'string' ? input.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}

/** 코드를 쓴 순간 넣을 Take 와 만료 시각 — 그 요금제의 한 달 포함량을 30일 동안. 이 시각이 코드 요금제가 끝나는 시각도 된다. */
export function voucherTakeGrant(plan: string, now: Date, durationDays = VOUCHER_TAKES_VALID_DAYS): { takes: number; expiresAt: string } {
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
    throw new Error('voucher duration must be 1..3650 days')
  }
  return {
    takes: getPlanEntitlements(plan).includedTakesPerMonth,
    expiresAt: new Date(now.getTime() + durationDays * 86_400_000).toISOString(),
  }
}

/** 계정 화면의 코드 입력 칸 — 코드를 쓸 수 있는 무료 요금제 계정에만 보인다. 할당량 면제 계정(관리자 · 시연)은 뺀다. */
export function showVoucherCard(account: { plan: string; unlimited: boolean }): boolean {
  return account.plan === 'free' && !account.unlimited
}

/** 관리자가 등록 고객에게 직접 정할 수 있는 남은 Take 수의 상한. DB 함수 admin_set_account_takes 와 같다. */
export const ADMIN_TAKE_LIMIT = 1_000_000

/** 관리자가 넣은 남은 Take 수 — 0에서 상한까지의 정수만. */
export function validAdminTakeTarget(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= ADMIN_TAKE_LIMIT
}

interface RedemptionForm {
  plan: string
  /** 종료일 YYYY-MM-DD */
  endDate: string
  /** 남은 Take 수. 계정이 없거나 칸이 비면 null */
  takes: number | null
}

/**
 * 등록 고객 줄의 [저장]이 보낼 것 — 바뀐 칸만. 티어·종료일이 그대로면 이용 기간을 다시 저장하지 않는다
 * (같은 날짜라도 저장 시각이 달라 기한을 옮기고 고객 내역에 회수·지급 줄이 쌓인다). 이용 기간을 먼저 저장한 뒤 Take 수를 맞춘다.
 */
export function redemptionSaveSteps(original: RedemptionForm, form: RedemptionForm): { access: boolean; takes: number | null } {
  return {
    access: form.plan !== original.plan || form.endDate !== original.endDate,
    takes: form.takes !== null && form.takes !== original.takes ? form.takes : null,
  }
}

/** 서버가 돌려준 실패 코드 → 화면 문장(영어 원문 = 사전 키). */
export function voucherFailureMessage(code: unknown): string {
  if (code === 'invalid') return 'This code is not valid. Check it and try again.'
  if (code === 'used') return 'This code has already been used.'
  if (code === 'not_free') return 'Codes can only be used on the Free plan.'
  return 'Could not apply the code. Please try again.'
}
