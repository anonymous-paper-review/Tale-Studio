// 스타일은 앱에서 고르게 하고 채팅에서는 설명이나 선택을 묻지 않는다 (#i18n-s5-batch6-chat)
import { describe, expect, it } from 'vitest'
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
