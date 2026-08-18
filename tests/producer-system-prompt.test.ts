import { describe, expect, it } from 'vitest'
import { PRODUCER_SYSTEM } from '@/app/api/produce/chat/system-prompt'

describe('PRODUCER_SYSTEM style selection rule', () => {
  it('스타일을 채팅으로 묻지 않고 스타일 픽커를 사용하도록 안내한다', () => {
    expect(PRODUCER_SYSTEM).toContain('Do not ask the user to describe or choose a visual art style in chat.')
    expect(PRODUCER_SYSTEM).toContain("Visual style is selected through the app's style picker")
    expect(PRODUCER_SYSTEM).toContain('continue the conversation without asking a style question')
  })
})
