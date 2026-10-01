// 자동 사고의 답변 공간을 확보하고 출력이 잘렸을 때 미완성 변경을 막는다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeChat } from '@/lib/claude'
import { prepareChatTools } from '@/lib/chat-tools/protocol'

const sdk = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn(), finalMessage: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  beta = { messages: { create: sdk.create, stream: sdk.stream } }
} }))
vi.mock('@/lib/timing', () => ({ logTiming: vi.fn() }))

function answer(content: unknown[], stop_reason = 'end_turn') {
  return {
    model: 'claude-sonnet-5-5', content, stop_reason,
    usage: { input_tokens: 15000, output_tokens: 8200 },
  }
}
const modelSettings = { model: 'claude-sonnet-5-5', effort: 'high', thinking: 'adaptive' } as const

beforeEach(() => {
  const response = answer([{ type: 'text', text: '설정을 확인했어요.' }])
  sdk.create.mockReset().mockResolvedValue(response)
  sdk.finalMessage.mockReset().mockResolvedValue(response)
  sdk.stream.mockReset().mockReturnValue({ finalMessage: sdk.finalMessage })
})

describe('채팅 출력 한도', () => {
  it('자동 사고를 켠 채팅이면 답변을 마칠 여유를 확보한다', async () => {
    // 왜: 사고와 답변이 8,192 토큰을 나눠 쓰면 사고 도중 또는 답변 도중에 끊긴다.
    for (const model of ['claude-sonnet-5-5', 'claude-opus-5-5'] as const) {
      const onUsage = vi.fn()
      const reply = await claudeChat('도와주세요.', [], '이야기를 다듬어줘', 0.7, 'chat-test', {
        modelSettings: { ...modelSettings, model }, onUsage,
      })
      expect(reply).toBe('설정을 확인했어요.')
      expect(sdk.stream).toHaveBeenLastCalledWith(expect.objectContaining({
        model, max_tokens: 32000,
        thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
        output_config: { effort: 'high' },
      }), expect.anything())
      expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ outputTokens: 8200, stopReason: 'end_turn' }))
    }
    expect(sdk.finalMessage).toHaveBeenCalledTimes(2)
    expect(sdk.create).not.toHaveBeenCalled()
  })

  it('별도 모델 설정 없이 채팅하면 자동 사고와 답변 공간을 확보한다', async () => {
    // 왜: 모델 선택값을 보내지 않는 내부 호출도 5.5의 기본 사고 때문에 답변이 잘리면 안 된다.
    await claudeChat('도와주세요.', [], '안녕', 0.7, 'chat-test')
    expect(sdk.stream).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-sonnet-5-5', max_tokens: 32000,
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
    }), expect.anything())
    expect(sdk.create).not.toHaveBeenCalled()
  })

  it('출력이 한도에서 잘리면 사용량을 기록하고 미완성 변경을 실행에 넘기지 않는다', async () => {
    // 왜: 변경 요청의 끝부분이 잘려도 앞부분만 실행되거나 같은 요청을 자동 반복하면 안 된다.
    const appTools = prepareChatTools('producer', true, [])!
    const onUsage = vi.fn()
    const response = answer([
      { type: 'text', text: '설정을 변경할게요.' },
      { type: 'tool_use', id: 'edit-1', name: 'edit_project', input: { resource: 'settings' } },
    ], 'max_tokens')
    sdk.create.mockResolvedValue(response)
    sdk.finalMessage.mockResolvedValue(response)

    await expect(claudeChat('도와주세요.', [], '대사 언어를 바꿔줘', 0.7, 'chat-test', {
      modelSettings, appTools, onUsage,
    })).rejects.toThrow(/output limit/i)

    expect(appTools.turn).toBeUndefined()
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ stopReason: 'max_tokens', outputTokens: 8200 }))
    expect(sdk.stream).toHaveBeenCalledTimes(1)
    expect(sdk.create).not.toHaveBeenCalled()
  })

  it('자동 사고 중 요청을 중단하면 모델 호출도 중단한다', async () => {
    // 왜: 자동 사고용 긴 응답을 기다리는 동안 중단한 요청이 계속 진행되면 안 된다.
    const controller = new AbortController()
    const appTools = prepareChatTools('producer', true, [])!
    const onUsage = vi.fn()
    sdk.stream.mockImplementationOnce((_body: unknown, options: { signal: AbortSignal }) => ({
      finalMessage: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('중단됨', 'AbortError')), { once: true })
      }),
    }))
    const pending = claudeChat('도와주세요.', [], '이야기를 다듬어줘', 0.7, 'chat-test', {
      modelSettings, appTools, signal: controller.signal, onUsage,
    })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()

    await rejected
    expect(sdk.stream.mock.calls[0][1].signal).toBe(controller.signal)
    expect(appTools.turn).toBeUndefined()
    expect(onUsage).not.toHaveBeenCalled()
  })
})
