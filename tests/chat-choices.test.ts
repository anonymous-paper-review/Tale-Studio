// 채팅 선택지 파서(#p4-choices 2026-08-06) 회귀 — [CHOICES] a | b | c 추출·제거.
import { describe, it, expect } from 'vitest'
import { parseChatChoices } from '@/lib/chat-choices'

describe('parseChatChoices', () => {
  it('선택지를 추출하고 본문에서 그 줄을 제거한다', () => {
    const { reply, choices } = parseChatChoices(
      '어떤 톤이 좋을까요?\n[CHOICES] 어둡고 건조하게 | 따뜻한 성장물 | 블랙 코미디\n',
    )
    expect(choices).toEqual(['어둡고 건조하게', '따뜻한 성장물', '블랙 코미디'])
    expect(reply).not.toContain('[CHOICES]')
    expect(reply).toContain('어떤 톤이')
  })

  it('마커가 없으면 원문 그대로, 선택지 빈 배열', () => {
    const { reply, choices } = parseChatChoices('그냥 답변입니다.')
    expect(choices).toEqual([])
    expect(reply).toBe('그냥 답변입니다.')
  })

  it('후보가 2개 미만이면 무시한다 (버튼 1개는 선택지가 아님)', () => {
    const { reply, choices } = parseChatChoices('본문\n[CHOICES] 하나뿐')
    expect(choices).toEqual([])
    expect(reply).toContain('[CHOICES]')
  })

  it('후보는 최대 4개로 자른다', () => {
    const { choices } = parseChatChoices('본문\n[CHOICES] a | b | c | d | e | f')
    expect(choices).toHaveLength(4)
  })
})
