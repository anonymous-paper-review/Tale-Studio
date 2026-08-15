import { describe, it, expect } from 'vitest'
import {
  classifyChatMessage,
  buildChatBlocks,
  handoffMarker,
  parseHandoffMarker,
  parseAttachmentMarker,
  withAttachmentMarker,
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

describe('첨부 마커', () => {
  const A = 'https://cdn.test/media/a.jpg'
  const B = 'https://cdn.test/media/b.png'

  it('왕복해도 본문이 보존된다', () => {
    const marked = withAttachmentMarker('이 그림체로 가줘', [A, B])
    expect(parseAttachmentMarker(marked)).toEqual({ text: '이 그림체로 가줘', urls: [A, B] })
  })

  it('첨부가 없으면 본문을 건드리지 않는다', () => {
    expect(withAttachmentMarker('그냥 텍스트', [])).toBe('그냥 텍스트')
    expect(parseAttachmentMarker('그냥 텍스트')).toEqual({ text: '그냥 텍스트', urls: [] })
  })

  it('본문 없이 첨부만 보낸 경우도 처리한다', () => {
    const marked = withAttachmentMarker('', [A])
    expect(parseAttachmentMarker(marked)).toEqual({ text: '', urls: [A] })
  })

  it('여러 줄 본문의 마지막 줄만 마커로 본다', () => {
    const marked = withAttachmentMarker('첫 줄\n둘째 줄', [A])
    expect(parseAttachmentMarker(marked).text).toBe('첫 줄\n둘째 줄')
  })

  it('사용자가 직접 친 📎 는 마커로 오인하지 않는다', () => {
    const typed = '📎 이거 첨부 아이콘이야'
    expect(parseAttachmentMarker(typed)).toEqual({ text: typed, urls: [] })
  })

  it('URL 이 아닌 토큰이 섞이면 마커가 아니다', () => {
    const bogus = `본문\n\n📎 ${A} 그리고뭔가`
    expect(parseAttachmentMarker(bogus).urls).toEqual([])
  })

  it('마커가 붙어도 user 로 분류된다 (상태 행으로 새지 않는다)', () => {
    const marked = withAttachmentMarker('웹툰 올렸어', [A])
    expect(classifyChatMessage({ role: 'user', content: marked })).toBe('user')
  })
})
