import { describe, it, expect } from 'vitest'
import {
  classifyChatMessage,
  buildChatBlocks,
  handoffMarker,
  parseHandoffMarker,
} from '@/lib/chat-blocks'

// #oiioii-chat — 채팅 렌더 분류 기준.
// 유저만 말풍선 / ✓·⚠ 알림은 상태 행 / 에이전트 일반 발화는 flat + 턴당 1회 role plate.

const user = (content: string) => ({ role: 'user' as const, content })
const model = (content: string) => ({ role: 'model' as const, content })

describe('classifyChatMessage', () => {
  it('유저 메시지는 user', () => {
    expect(classifyChatMessage(user('안녕'))).toBe('user')
    // 유저가 ✓ 로 시작하는 말을 해도 user (분류는 role 우선)
    expect(classifyChatMessage(user('✓ 확인했어'))).toBe('user')
  })

  it('완료(✓)/실패(⚠) 알림은 status', () => {
    expect(classifyChatMessage(model('✓ 샷 이미지 생성이 완료됐어요. Director 탭에서 확인하세요.'))).toBe('status')
    expect(classifyChatMessage(model('⚠ 샷 이미지 생성을 시작하지 못했어요 — 크레딧 부족'))).toBe('status')
    // 앞 공백 허용 (trimStart 판정)
    expect(classifyChatMessage(model('  ✓ 완료'))).toBe('status')
  })

  it('일반 에이전트 발화는 text (본문 중간의 ✓ 는 무관)', () => {
    expect(classifyChatMessage(model('네, 클로즈업 샷을 추가했어요.'))).toBe('text')
    expect(classifyChatMessage(model('체크리스트: ✓ 항목'))).toBe('text')
  })
})

describe('buildChatBlocks — role plate 는 model run 의 첫 text 메시지에만', () => {
  it('연속 model text 두 개 → 첫 번째만 plate', () => {
    const blocks = buildChatBlocks([user('요청'), model('답 1'), model('답 2')])
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true, false])
  })

  it('유저 발화가 run 을 리셋 → 다음 model text 가 새 plate', () => {
    const blocks = buildChatBlocks([
      user('요청 1'),
      model('답 1'),
      user('요청 2'),
      model('답 2'),
    ])
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true, false, true])
  })

  it('status 는 턴을 열지 않는다 — plate 없음, 뒤따르는 text 가 plate 를 연다', () => {
    const blocks = buildChatBlocks([
      model('✓ 생성이 완료됐어요.'),
      model('다음 단계로 넘어갈까요?'),
    ])
    expect(blocks.map((b) => b.kind)).toEqual(['status', 'text'])
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true])
  })

  it('text 뒤의 status 는 plate 를 다시 열지 않는다', () => {
    const blocks = buildChatBlocks([
      user('요청'),
      model('진행할게요.'),
      model('✓ 완료됐어요.'),
      model('결과를 확인해 주세요.'),
    ])
    // 같은 run 안이므로 마지막 text 도 plate 없음 (plate 는 run 당 1회)
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true, false, false])
  })

  it('구간이 model 로 시작해도 첫 text 에 plate (섹션 경계 = 턴 시작)', () => {
    const blocks = buildChatBlocks([model('이어서 진행할게요.')])
    expect(blocks[0].showRolePlate).toBe(true)
  })

  it('빈 목록은 빈 블록', () => {
    expect(buildChatBlocks([])).toEqual([])
  })
})

describe('handoff 마커 (⇄, #oiioii-handoff)', () => {
  it('직렬화 ↔ 파싱 왕복', () => {
    const marker = handoffMarker('producer', 'writer')
    expect(classifyChatMessage(model(marker))).toBe('handoff')
    expect(parseHandoffMarker(marker)).toEqual({ from: 'producer', to: 'writer' })
  })

  it('형태가 어긋나면 null (렌더러가 flat 으로 폴백)', () => {
    expect(parseHandoffMarker('⇄ producer')).toBeNull()
    expect(parseHandoffMarker('⇄ producer→banana')).toBeNull()
    expect(parseHandoffMarker('일반 문장')).toBeNull()
  })

  it('handoff 는 턴을 열지 않는다 — plate 없음, 다음 text 가 연다', () => {
    const blocks = buildChatBlocks([
      model(handoffMarker('producer', 'writer')),
      model('씬을 나눠봤어요.'),
    ])
    expect(blocks.map((b) => b.kind)).toEqual(['handoff', 'text'])
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true])
  })
})
