// 선택한 채팅 설정을 실제 모델 요청에 전달하고 사고 블록과 출력 실패를 보존한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeChat, claudeJSON } from '@/lib/claude'
import { prepareChatTools } from '@/lib/chat-tools/protocol'
import type { ChatModelSettings } from '@/lib/chat-model-settings'

const sdk = vi.hoisted(() => ({ chat: vi.fn(), json: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  beta = { messages: { create: sdk.chat } }
  messages = { create: sdk.json }
} }))
vi.mock('@/lib/timing', () => ({ logTiming: vi.fn() }))
const answer = (content: unknown[], stop_reason = 'end_turn') => ({
  model: 'claude-sonnet-4-6', content, stop_reason,
  usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
})
beforeEach(() => {
  sdk.chat.mockReset().mockResolvedValue(answer([{ type: 'text', text: '확인했어요.' }]))
  sdk.json.mockReset().mockResolvedValue(answer([{ type: 'text', text: '{"ok":true}' }]))
})

describe('채팅 모델 설정의 실제 호출', () => {
  it('모든 지원 조합을 그대로 보내고 thinking 자동에서는 temperature를 보내지 않는다', async () => {
    // 왜: 모델 선택 UI가 실제 요청을 바꾸며 자동 사고와 충돌하는 샘플링 설정을 제거해야 한다.
    for (const model of ['claude-sonnet-4-6', 'claude-opus-4-6'] as const)
      for (const effort of ['low', 'medium', 'high', 'max'] as const)
        for (const thinking of ['off', 'adaptive'] as const) {
          const modelSettings: ChatModelSettings = { model, effort, thinking }
          const onUsage = vi.fn()
          await claudeChat('도와주세요', [], '현재 설정을 알려줘', 0.7, 'test', { modelSettings, onUsage })
          const request = sdk.chat.mock.calls.at(-1)![0]
          expect(request).toMatchObject({ model, output_config: { effort }, thinking: { type: thinking === 'off' ? 'disabled' : 'adaptive' } })
          if (thinking === 'adaptive') expect(request).not.toHaveProperty('temperature')
          else expect(request.temperature).toBe(0.7)
          expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ effort, thinking }))
        }
  })
  it('사고와 도구 호출의 원본 블록을 바꾸지 않고 후속 요청에 전달한다', async () => {
    // 왜: 도구 응답의 사고 서명과 순서가 변하면 다음 호출이 거절되거나 사고가 비활성화될 수 있다.
    const content = [{ type: 'thinking', thinking: 'test only', signature: 'opaque-signature' },
      { type: 'redacted_thinking', data: 'opaque-data' },
      { type: 'tool_use', id: 'read', name: 'read_project', input: { resource: 'settings' } }]
    sdk.chat.mockResolvedValueOnce(answer(content, 'tool_use'))
    const modelSettings: ChatModelSettings = { model: 'claude-opus-4-6', effort: 'high', thinking: 'adaptive' }
    const appTools = prepareChatTools('producer', true, [])!
    await claudeChat('도와주세요', [], '언어를 알려줘', 0.7, 'test', { modelSettings, appTools })
    expect(appTools.turn?.content).toEqual(content)
    const messages = [{ role: 'assistant', content: appTools.turn!.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'read', content: '{"status":"ok"}' }] }]
    await claudeChat('도와주세요', [], '언어를 알려줘', 0.7, 'test', { modelSettings, appTools: prepareChatTools('producer', true, messages) })
    expect(sdk.chat.mock.calls[1][0].messages.slice(-2)).toEqual(messages)
  })
  it('출력이 잘리면 부분 답변을 완료한 응답으로 돌려주지 않는다', async () => {
    // 왜: 사고가 출력 예산을 쓰거나 큰 변경이 잘렸을 때 불완전한 답변을 저장 성공으로 처리하면 안 된다.
    sdk.chat.mockResolvedValueOnce(answer([{ type: 'text', text: '{"reply":"변경했어요"' }], 'max_tokens'))
    await expect(claudeChat('도와주세요', [], '고쳐줘')).rejects.toThrow(/output limit/i)
  })
  it('채팅에서 Opus를 선택해도 별도 JSON 생성 모델은 기존 Sonnet을 유지한다', async () => {
    // 왜: 채팅 실험이 Writer 생성 등 다른 모델 호출에 영향을 주면 안 된다.
    await claudeChat('도와주세요', [], '안녕', 0.7, 'test', { modelSettings: { model: 'claude-opus-4-6', effort: 'high', thinking: 'adaptive' } })
    await claudeJSON('JSON', '생성')
    expect(sdk.json.mock.calls[0][0].model).toBe('claude-sonnet-4-6')
    expect(sdk.json.mock.calls[0][0]).not.toHaveProperty('thinking')
  })
})
