import { describe, expect, it } from 'vitest'
import { buildProducerSystem } from '@/app/api/produce/chat/system-prompt'

// PRODUCER_SYSTEM 상수가 buildProducerSystem(locale) 로 리팩터됨(#i18n-s5-batch6-chat) —
// 스타일 픽커 규칙은 로케일과 무관하게 프롬프트에 남아야 한다.
describe('buildProducerSystem style selection rule', () => {
  it.each(['ko', 'en'] as const)(
    '(%s) 스타일을 채팅으로 묻지 않고 스타일 픽커를 사용하도록 안내한다',
    (locale) => {
      const prompt = buildProducerSystem(locale)
      expect(prompt).toContain('Do not ask the user to describe or choose a visual art style in chat.')
      expect(prompt).toContain("Visual style is selected through the app's style picker")
      expect(prompt).toContain('continue the conversation without asking a style question')
    },
  )
})
