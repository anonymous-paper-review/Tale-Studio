// Writer 의 Claude 요청은 모델과 답 한도에 상관없이 스트리밍으로 받아, 답 한도가 커도 SDK 가 거절하지 않는다(오너 2026-11-11 결정 1 — 샷 점검 다시 켜기)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn() }))
// 진짜 SDK 처럼 흉내 낸다: 스트리밍 없이 답 한도가 약 21,333 을 넘으면 보내기 전에 거절한다(SDK 0.80 calculateNonstreamingTimeout).
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: (params: { max_tokens: number }) => {
        if ((60 * 60 * params.max_tokens) / 128000 > 10 * 60) {
          throw new Error('Streaming is required for operations that may take longer than 10 minutes. See https://github.com/anthropics/anthropic-sdk-typescript#long-requests for more details')
        }
        return sdk.create(params)
      },
      stream: (params: unknown) => ({ finalMessage: () => sdk.stream(params) }),
    }
  },
}))

import { claudeGenerateJson } from '@/lib/writer/llm/claude'
import { DEFAULT_MODELS, generateJson } from '@/lib/writer/llm/dispatch'

const answer = (text: string) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 } })
const VALIDATION = '{"shots_to_split":[],"semantic_issues":[{"category":"continuity","severity":"WARNING","location":"shot_2","message":"coat color changes"}]}'

beforeEach(() => {
  sdk.create.mockReset().mockResolvedValue(answer(VALIDATION))
  sdk.stream.mockReset().mockResolvedValue(answer(VALIDATION))
})

describe('Writer 의 Claude 요청 — 스트리밍', () => {
  // 왜: 샷 점검이 9/2부터 Claude 4.x 에 답 한도 32,000 을 스트리밍 없이 보내 SDK 가 보내기도 전에 거절했고, 점검 없이 조용히 넘어갔다.
  it('Claude 4.x 모델에 답 한도를 크게(32,000) 보내도 스트리밍으로 받아, SDK 가 거절하지 않고 결과를 돌려준다', async () => {
    const result = await claudeGenerateJson<{ semantic_issues: unknown[] }>('점검해 줘', { model: 'claude-sonnet-4-6', maxTokens: 32000 })
    expect(result.semantic_issues).toHaveLength(1)
    expect(sdk.stream).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-4-6', max_tokens: 32000 }))
    expect(sdk.create).not.toHaveBeenCalled()
  })

  // 왜: 실제로 막히던 길 — 샷 점검은 점검 축 기본 모델(Claude 4.x)로 답 한도 32,000 을 보낸다.
  it('샷 점검처럼 기본 점검 모델(Claude 4.x)에 답 한도 32,000 으로 보내는 요청이 거절 없이 결과를 받는다', async () => {
    expect(DEFAULT_MODELS.C).toMatchObject({ provider: 'claude', model: expect.stringMatching(/^claude-[a-z]+-4/) })
    const result = await generateJson<{ semantic_issues: unknown[] }>('점검해 줘', DEFAULT_MODELS.C, { systemInstruction: '점검 지시', temperature: 0.3, maxTokens: 32000 })
    expect(result.semantic_issues).toHaveLength(1)
  })

  // 왜: 혼자 정한 것 — 한도 계산을 SDK 와 우리 코드 두 군데에 두지 않는다. 작은 답 한도도 Claude 5 와 같은 길로 받는다.
  it('Claude 4.x 모델은 답 한도가 작아도 스트리밍으로 받는다', async () => {
    await claudeGenerateJson('점검해 줘', { model: 'claude-sonnet-4-6', maxTokens: 4096 })
    expect(sdk.stream).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 4096, temperature: 0.3 }))
    expect(sdk.create).not.toHaveBeenCalled()
  })

  // 왜: 정상 경로 고정 — Claude 5 는 사고 토큰 때문에 답 한도 바닥 32,000 을 두고, temperature 를 보내면 거절된다.
  it('Claude 5 모델은 지금처럼 스트리밍으로 받고, 답 한도 바닥 32,000과 temperature 없음을 지킨다', async () => {
    await claudeGenerateJson('추천해 줘', { model: 'claude-sonnet-5-5', maxTokens: 4096, temperature: 0.7 })
    const request = sdk.stream.mock.calls[0][0]
    expect(request).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 32000 })
    expect(request).not.toHaveProperty('temperature')
    expect(sdk.create).not.toHaveBeenCalled()
  })
})
