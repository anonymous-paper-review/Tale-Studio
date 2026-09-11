// 채팅에서 선택한 모델과 사고 설정을 검증하고 한 요청 동안 그대로 사용한다
import { describe, expect, it } from 'vitest'
import { CHAT_MODELS, CHAT_EFFORTS, DEFAULT_CHAT_MODEL_SETTINGS, parseChatModelSettings } from '@/lib/chat-model-settings'

describe('채팅 모델 설정', () => {
  it('설정을 바꾸지 않으면 기존 Sonnet과 높은 effort 및 thinking 꺼짐을 사용한다', () => {
    // 왜: 정상 경로 고정. 새 선택 기능이 기존 요청의 기본 동작을 바꾸면 안 된다.
    expect(parseChatModelSettings(undefined)).toEqual({ model: 'claude-sonnet-4-6', effort: 'high', thinking: 'off' })
    expect(DEFAULT_CHAT_MODEL_SETTINGS).toEqual(parseChatModelSettings(undefined))
  })
  it('지원하는 모델과 사고 설정의 모든 조합을 선택할 수 있다', () => {
    // 왜: 화면에서 선택한 유효한 조합이 서버에서 임의로 다른 값으로 바뀌면 안 된다.
    let count = 0
    for (const model of CHAT_MODELS) for (const effort of CHAT_EFFORTS) for (const thinking of ['off', 'adaptive']) {
      const selected = { model: model.id, effort, thinking }
      expect(parseChatModelSettings(selected)).toEqual(selected)
      count++
    }
    expect(count).toBe(16)
  })
  it.each([null, [], 'opus', 3, {}, { model: 'claude-opus-4-6' },
    { model: 'arbitrary-model', effort: 'high', thinking: 'off' },
    { model: 'claude-sonnet-4-6', effort: 'xhigh', thinking: 'off' },
    { model: 'claude-sonnet-4-6', effort: 'high', thinking: 'enabled' },
    { model: 'claude-sonnet-4-6', effort: 'high', thinking: 'off', budget: 9000 },
  ])('지원하지 않는 설정은 다른 기본값으로 바꾸지 않고 거절한다 (%j)', value => {
    // 왜: 조작되거나 손상된 선택값을 조용히 다른 모델로 실행하면 비용과 실험 결과가 달라진다.
    expect(parseChatModelSettings(value)).toBeNull()
  })
})
