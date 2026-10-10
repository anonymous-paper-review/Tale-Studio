// _moderation.ts — 검사 통과 영수증 픽스처. 제출 함수(falImageSubmit·falVideoSubmit 등)는 "검사를
//   통과한 입력"만 받으므로(#creem-moderation 2026-10-11), 제출 함수를 직접 부르는 테스트가 이
//   픽스처로 표식을 붙인다. 표식은 타입에만 있어 객체는 그대로 지나간다 — 제출에 실제로 넘어가는
//   인자는 달라지지 않는다. `_` 접두라 vitest 가 테스트로 집어가지 않는다.
import { moderatedSubmitInput, type ModerationReceipt } from '@/lib/moderation/creem'

/** 통과 영수증 한 장 — 모양 검문(assertModerationReceipt)을 지나는 최소 필드. */
export const MODERATION_FIXTURE: ModerationReceipt = {
  decision: 'allow',
  id: 'mod-fixture',
  checked_at: '2026-10-11T00:00:00.000Z',
  chars: 12,
  text_sha256: 'f'.repeat(64),
}

/** 제출 입력에 검사 표식만 붙인다(값·필드는 그대로). */
export function moderated<T extends object>(opts: T) {
  return moderatedSubmitInput(opts, MODERATION_FIXTURE)
}
