// 바우처 코드(2026-10-27 오너): 아이디 · 비밀번호를 나눠 주던 테스트 계정 대신 코드를 준다.
//   구글로 로그인한 사용자가 계정 화면에 코드를 넣으면 그 요금제와 한 달 Take 가 들어온다.
//   코드마다 쓸 수 있는 계정 수가 있고(10-27 코드는 1, 10-29 공용 코드는 여러 명), 한 계정은 같은 코드를 한 번만 쓴다.
//   코드는 scripts/create-vouchers.mjs 가 만들어 vouchers 표(서버만 읽음)에 넣고, 쓰기는 DB 함수 redeem_voucher 한 곳이 판정한다.
//   약속: tests/billing/voucher.test.ts
import { getPlanEntitlements } from '@/lib/plan-limits'

/** 코드로 받은 Take 가 살아 있는 날 수. 코드 요금제는 결제가 없어 매달 다시 채워지지 않으므로 한 달치를 한 번 준다. */
export const VOUCHER_TAKES_VALID_DAYS = 30

/** 정리한 코드 모양(대문자 · 숫자). 만드는 코드는 TALE + 8자이고, DB 제약도 같은 범위다. */
export const VOUCHER_CODE_PATTERN = /^[A-Z0-9]{8,32}$/

export type VoucherFailure = 'invalid' | 'used' | 'not_free'

/** 받은 사람이 옮겨 적은 코드를 저장 모양으로 — 대소문자 · 띄어쓰기 · 하이픈을 가리지 않는다. */
export function normalizeVoucherCode(input: unknown): string {
  return typeof input === 'string' ? input.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}

/** 코드를 쓴 순간 넣을 Take 와 만료 시각 — 그 요금제의 한 달 포함량을 30일 동안. */
export function voucherTakeGrant(plan: string, now: Date): { takes: number; expiresAt: string } {
  return {
    takes: getPlanEntitlements(plan).includedTakesPerMonth,
    expiresAt: new Date(now.getTime() + VOUCHER_TAKES_VALID_DAYS * 86_400_000).toISOString(),
  }
}

/** 계정 화면의 코드 입력 칸 — 코드를 쓸 수 있는 무료 요금제 계정에만 보인다. 할당량 면제 계정(관리자 · 시연)은 뺀다. */
export function showVoucherCard(account: { plan: string; unlimited: boolean }): boolean {
  return account.plan === 'free' && !account.unlimited
}

/** 서버가 돌려준 실패 코드 → 화면 문장(영어 원문 = 사전 키). */
export function voucherFailureMessage(code: unknown): string {
  if (code === 'invalid') return 'This code is not valid. Check it and try again.'
  if (code === 'used') return 'This code has already been used.'
  if (code === 'not_free') return 'Codes can only be used on the Free plan.'
  return 'Could not apply the code. Please try again.'
}
