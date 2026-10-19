// 리뉴얼 1차: Writer 채팅은 산문만 다룬다 — "다시 써줘"는 다시 쓰기 조건을, 넘김 말은 산문 확정 창을, 나머지는 수정 요청으로 읽는다 (2026-10-19)
import { describe, expect, it } from 'vitest'
import { writerChatIntent } from '@/lib/prose/writer-chat'

describe('Writer 채팅 말 읽기', () => {
  // 왜: 프로토타입 — "다시 써줘"라고만 하면 어떤 조건으로 다시 쓸지 먼저 묻는다(1안 조건 패널 · 2안 조건 카드).
  it.each(['다시 써줘', '다시 써 주세요', '다시써', 'Rewrite it', 'rewrite'])('"%s"라고만 하면 다시 쓰기 조건을 연다', (text) => {
    expect(writerChatIntent(text)).toBe('rewrite')
  })

  // 왜: 고칠 점을 함께 말하면 조건을 다시 묻지 않고 그 말대로 고친다.
  it('고칠 점을 함께 말하면 그 말대로 산문 수정안을 만든다', () => {
    expect(writerChatIntent('팀장을 더 얄밉게 다시 써줘')).toBe('revise')
    expect(writerChatIntent('더 짧게')).toBe('revise')
  })

  // 왜: Writer 의 다음 단계는 산문 확정(브레이크다운)이다 — 넘김 말은 확정 창을 열고, 바로 넘기지 않는다.
  it.each(['Artist로 넘겨줘', '브레이크다운 해줘', '다음 단계로 넘어가자', 'Please hand over to Artist'])('"%s"라고 하면 산문 확정 창을 연다', (text) => {
    expect(writerChatIntent(text)).toBe('breakdown')
  })

  // 왜: 넘기지 말라는 말은 넘김이 아니다.
  it('넘기지 말라는 말은 산문 확정 창을 열지 않는다', () => {
    expect(writerChatIntent('아직 Artist로 넘기지 마')).not.toBe('breakdown')
  })
})
