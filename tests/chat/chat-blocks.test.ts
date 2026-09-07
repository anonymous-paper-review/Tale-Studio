// 사용자와 답변을 올바른 말풍선과 단계 안내로 보여 주고 첨부 글을 그대로 보존한다 (#oiioii-chat)
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
  it('사용자가 보낸 말은 사용자 말풍선으로 보여 준다', () => {
    expect(classifyChatMessage(user('안녕'))).toBe('user')
    // 유저가 ✓ 로 시작하는 말을 해도 user (분류는 role 우선)
    expect(classifyChatMessage(user('✓ 확인했어'))).toBe('user')
  })

  it('완료(✓)나 실패(⚠) 알림은 상태 안내로 보여 준다', () => {
    expect(classifyChatMessage(model('✓ 샷 이미지 생성이 완료됐어요. Director 탭에서 확인하세요.'))).toBe('status')
    expect(classifyChatMessage(model('⚠ 샷 이미지 생성을 시작하지 못했어요 — 크레딧 부족'))).toBe('status')
    // 앞 공백 허용 (trimStart 판정)
    expect(classifyChatMessage(model('  ✓ 완료'))).toBe('status')
  })

  it('일반 답변은 본문 한가운데 ✓가 있어도 일반 말풍선으로 보여 준다', () => {
    expect(classifyChatMessage(model('네, 클로즈업 샷을 추가했어요.'))).toBe('text')
    expect(classifyChatMessage(model('체크리스트: ✓ 항목'))).toBe('text')
  })
})

describe('buildChatBlocks — 한 번의 답변 묶음에서 첫 답변에만 이름표를 붙인다', () => {
  it('연이어 온 두 답변에는 첫 답변에만 이름표를 붙인다', () => {
    const blocks = buildChatBlocks([user('요청'), model('답 1'), model('답 2')])
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true, false])
  })

  it('사용자가 다시 말하면 다음 답변에 새 이름표를 붙인다', () => {
    const blocks = buildChatBlocks([
      user('요청 1'),
      model('답 1'),
      user('요청 2'),
      model('답 2'),
    ])
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true, false, true])
  })

  it('완료 안내 다음 답변에 새 이름표를 붙인다', () => {
    const blocks = buildChatBlocks([
      model('✓ 생성이 완료됐어요.'),
      model('다음 단계로 넘어갈까요?'),
    ])
    expect(blocks.map((b) => b.kind)).toEqual(['status', 'text'])
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true])
  })

  it('답변 뒤의 완료 안내 다음에는 이름표를 다시 붙이지 않는다', () => {
    const blocks = buildChatBlocks([
      user('요청'),
      model('진행할게요.'),
      model('✓ 완료됐어요.'),
      model('결과를 확인해 주세요.'),
    ])
    // 같은 run 안이므로 마지막 text 도 plate 없음 (plate 는 run 당 1회)
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true, false, false])
  })

  it('답변으로 시작하는 구간도 첫 답변에 이름표를 붙인다', () => {
    const blocks = buildChatBlocks([model('이어서 진행할게요.')])
    expect(blocks[0].showRolePlate).toBe(true)
  })

  it('대화가 없으면 빈 화면을 보여 준다', () => {
    expect(buildChatBlocks([])).toEqual([])
  })
})

describe('단계 넘김 안내 (⇄, #oiioii-handoff)', () => {
  it('단계 넘김 표시를 만들었다가 읽어도 보낸 단계가 그대로 남는다', () => {
    const marker = handoffMarker('producer', 'writer')
    expect(classifyChatMessage(model(marker))).toBe('handoff')
    expect(parseHandoffMarker(marker)).toEqual({ from: 'producer', to: 'writer' })
  })

  it('잘못된 단계 넘김 표시는 일반 글로 보여 준다', () => {
    expect(parseHandoffMarker('⇄ producer')).toBeNull()
    expect(parseHandoffMarker('⇄ producer→banana')).toBeNull()
    expect(parseHandoffMarker('일반 문장')).toBeNull()
  })

  it('단계 넘김 표시는 답변 묶음을 열지 않고 다음 답변에 이름표를 붙인다', () => {
    const blocks = buildChatBlocks([
      model(handoffMarker('producer', 'writer')),
      model('씬을 나눠봤어요.'),
    ])
    expect(blocks.map((b) => b.kind)).toEqual(['handoff', 'text'])
    expect(blocks.map((b) => b.showRolePlate)).toEqual([false, true])
  })
})

describe('첨부 파일 안내', () => {
  const A = 'https://cdn.test/media/a.jpg'
  const B = 'https://cdn.test/media/b.png'

  it('첨부를 붙였다 떼어도 본문이 그대로 보인다', () => {
    const marked = withAttachmentMarker('이 그림체로 가줘', [A, B])
    expect(parseAttachmentMarker(marked)).toEqual({ text: '이 그림체로 가줘', urls: [A, B] })
  })

  it('첨부 없이 보내면 글을 그대로 보여 준다', () => {
    expect(withAttachmentMarker('그냥 텍스트', [])).toBe('그냥 텍스트')
    expect(parseAttachmentMarker('그냥 텍스트')).toEqual({ text: '그냥 텍스트', urls: [] })
  })

  it('글 없이 첨부만 보내도 첨부를 보여 준다', () => {
    const marked = withAttachmentMarker('', [A])
    expect(parseAttachmentMarker(marked)).toEqual({ text: '', urls: [A] })
  })

  it('여러 줄 글에 첨부해도 전체 글을 그대로 보여 준다', () => {
    const marked = withAttachmentMarker('첫 줄\n둘째 줄', [A])
    expect(parseAttachmentMarker(marked).text).toBe('첫 줄\n둘째 줄')
  })

  it('사용자가 글에 직접 입력한 📎는 첨부로 잘못 인식하지 않는다', () => {
    const typed = '📎 이거 첨부 아이콘이야'
    expect(parseAttachmentMarker(typed)).toEqual({ text: typed, urls: [] })
  })

  it('인터넷 주소가 아닌 글이 섞인 첨부 안내는 첨부로 처리하지 않는다', () => {
    const bogus = `본문\n\n📎 ${A} 그리고뭔가`
    expect(parseAttachmentMarker(bogus).urls).toEqual([])
  })

  it('첨부가 붙은 사용자 글도 사용자 말풍선으로 보여 준다', () => {
    const marked = withAttachmentMarker('웹툰 올렸어', [A])
    expect(classifyChatMessage({ role: 'user', content: marked })).toBe('user')
  })
})
