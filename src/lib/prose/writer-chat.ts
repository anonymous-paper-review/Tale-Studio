// Writer 채팅 말 읽기(리뉴얼 1차 2026-10-19). Writer(id producer)는 산문만 다룬다.
//   "다시 써줘"라고만 하면 다시 쓰기 조건을 묻고(프로토타입 send → WC1), 넘김 말(Artist로 · 브레이크다운 · 다음 단계)은
//   산문 확정 창을 연다 — 확정하면 산문이 잠기므로 바로 넘기지 않는다. 나머지 말은 산문 수정 요청이다.
//   인식은 코드가 한다(handoff-intent 와 같은 원칙 — 되돌리기 어려운 전이는 모델 해석에 맡기지 않는다).
import { hasNonRequestContext, matchHandoffIntent } from '@/lib/handoff-intent'

export type WriterChatIntent = 'rewrite' | 'breakdown' | 'revise'

// 조건 없이 "다시 써줘"만 — 고칠 점이 함께 있으면 그 말대로 수정안을 만든다.
const REWRITE_ONLY = /^\s*(?:다시\s*(?:써|쓰)\s*(?:줘|주세요|줄래|봐)?|rewrite(?:\s+it)?(?:\s+please)?|write\s+it\s+again)\s*[.!?~]*\s*$/i // i18n-ok: 사용자 말에서 "다시 써줘"를 알아듣는 정규식
const BREAKDOWN_WORDS = /브레이크다운|breakdown|break\s+it\s+down/i // i18n-ok: 사용자 말에서 브레이크다운 요청을 알아듣는 정규식

export function writerChatIntent(text: string): WriterChatIntent {
  const said = text.trim()
  if (REWRITE_ONLY.test(said)) return 'rewrite'
  if (matchHandoffIntent(said, 'producer')) return 'breakdown'
  if (BREAKDOWN_WORDS.test(said) && !hasNonRequestContext(said)) return 'breakdown'
  return 'revise'
}
