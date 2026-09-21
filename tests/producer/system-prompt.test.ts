// 스타일은 앱에서 고르게 하고 채팅에서는 설명이나 선택을 묻지 않는다 (#i18n-s5-batch6-chat)
import { describe, expect, it } from 'vitest'
import { CHAT_TOOL_GUIDE } from '@/lib/chat-tools/protocol'
import { buildProducerSystem } from '@/app/api/produce/chat/system-prompt'

// PRODUCER_SYSTEM 상수가 buildProducerSystem(locale) 로 리팩터됨(#i18n-s5-batch6-chat) —
// 스타일 픽커 규칙은 로케일과 무관하게 프롬프트에 남아야 한다.
describe('buildProducerSystem의 스타일 선택 약속', () => {
  it.each(['ko', 'en'] as const)(
    '(%s) 스타일 선택을 앱에서 하도록 안내하고 채팅에서는 묻지 않는다',
    (locale) => {
      const prompt = buildProducerSystem(locale)
      expect(prompt).toContain('Do not ask the user to describe or choose a visual art style in chat.')
      expect(prompt).toContain("Visual style is selected through the app's style picker")
      expect(prompt).toContain('continue the conversation without asking a style question')
    },
  )
})

// 왜: 언어 편집 도구 결과를 받은 뒤 누락 스타일을 다시 묻던 상충 지침을 막는다.
it('구체적 조회와 편집에 다른 기획 질문을 끼워 넣지 않고 원래 요청의 남은 작업만 계속한다', () => {
  const prompt = buildProducerSystem('ko')
  expect(prompt).toContain('A specific query or edit is not a request to resume the planning interview.')
  expect(prompt).not.toContain("When the user's input lacks any of the 4 story criteria above, ask targeted follow-up questions")
  expect(prompt).not.toContain('include storyText in EVERY reply')
  expect(CHAT_TOOL_GUIDE).toContain('Do not introduce unrelated planning questions or choices after a tool result.')
  expect(CHAT_TOOL_GUIDE).toContain('continue only the remaining requested targets')
  expect(prompt).toContain('<style_anchor_by_name>')
})
