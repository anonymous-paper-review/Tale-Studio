// 선택한 채팅 설정을 실제 모델 요청에 전달하고 사고 블록과 출력 실패를 보존한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeChat, claudeJSON } from '@/lib/claude'
import { prepareChatTools } from '@/lib/chat-tools/protocol'
import type { ChatModelSettings } from '@/lib/chat-model-settings'

const sdk = vi.hoisted(() => ({ chat: vi.fn(), json: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  beta = { messages: {
    create: sdk.chat,
    stream: (...args: unknown[]) => ({ finalMessage: () => sdk.chat(...args) }),
  } }
  messages = { create: sdk.json, stream: (...args: unknown[]) => ({ finalMessage: () => sdk.json(...args) }) }
} }))
vi.mock('@/lib/timing', () => ({ logTiming: vi.fn() }))
const answer = (content: unknown[], stop_reason = 'end_turn') => ({
  model: 'claude-sonnet-5-5', content, stop_reason,
  usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
})
beforeEach(() => {
  sdk.chat.mockReset().mockResolvedValue(answer([{ type: 'text', text: '확인했어요.' }]))
  sdk.json.mockReset().mockResolvedValue(answer([{ type: 'text', text: '{"ok":true}' }]))
})

describe('채팅 모델 설정의 실제 호출', () => {
  it('5.5 모델을 선택하면 자동 사고와 선택한 effort를 보내고 temperature는 보내지 않는다', async () => {
    // 왜: 5.5는 사고 끄기와 temperature를 지원하지 않아 이전 설정을 보내면 요청이 거절된다.
    for (const model of ['claude-sonnet-5-5', 'claude-opus-5-5'] as const)
      for (const effort of ['low', 'medium', 'high', 'max'] as const)
        for (const thinking of ['adaptive'] as const) {
          const modelSettings: ChatModelSettings = { model, effort, thinking }
          const onUsage = vi.fn()
          await claudeChat('도와주세요', [], '현재 설정을 알려줘', 0.7, 'test', { modelSettings, onUsage })
          const request = sdk.chat.mock.calls.at(-1)![0]
          expect(request).toMatchObject({ model, output_config: { effort }, thinking: { type: 'adaptive' } })
          expect(request).not.toHaveProperty('temperature')
          expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ effort, thinking }))
        }
  })
  it('사고와 도구 호출의 원본 블록을 바꾸지 않고 후속 요청에 전달한다', async () => {
    // 왜: 도구 응답의 사고 서명과 순서가 변하면 다음 호출이 거절되거나 사고가 비활성화될 수 있다.
    const content = [{ type: 'thinking', thinking: 'test only', signature: 'opaque-signature' },
      { type: 'redacted_thinking', data: 'opaque-data' },
      { type: 'tool_use', id: 'read', name: 'read_project', input: { resource: 'settings' } }]
    sdk.chat.mockResolvedValueOnce(answer(content, 'tool_use'))
    const modelSettings: ChatModelSettings = { model: 'claude-opus-5-5', effort: 'high', thinking: 'adaptive' }
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
  it('도구 실행 뒤 프로젝트 문맥이 바뀌면 원본 응답을 보존하고 호환되지 않는 사고만 제외하도록 요청한다', async () => {
    // 왜: 도구 실행 후 최신 설정과 이미지를 다시 읽으면 5.5의 이전 사고 서명이 거절되어 대화가 끊길 수 있다.
    for (const model of ['claude-sonnet-5-5', 'claude-opus-5-5'] as const) {
      const content = [
        { type: 'thinking', thinking: '', signature: 'opaque-signature' },
        { type: 'tool_use', id: 'read', name: 'read_project', input: { resource: 'settings' } },
      ]
      const original = structuredClone(content)
      const modelSettings: ChatModelSettings = { model, effort: 'high', thinking: 'adaptive' }
      sdk.chat.mockResolvedValueOnce(answer(content, 'tool_use'))
      const appTools = prepareChatTools('producer', true, [])!
      await claudeChat('현재 설정을 읽으세요.', [], '대사 언어: 미정', 0.7, 'test', { modelSettings, appTools })
      const messages = [
        { role: 'assistant', content: appTools.turn!.content },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'read', content: '{"dialogueLanguage":"ko"}' }] },
      ]
      await claudeChat('갱신된 설정을 읽으세요.', [], '대사 언어: 한국어', 0.7, 'test', {
        modelSettings, appTools: prepareChatTools('producer', true, messages),
      })
      const request = sdk.chat.mock.calls.at(-1)![0]
      expect(request.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } })
      expect(request.betas).toEqual(expect.arrayContaining(['compact-2026-01-12', 'thinking-binding-controls-2026-08-01']))
      expect(request.messages.slice(-2)).toEqual(messages)
      expect(content).toEqual(original)
    }
  })
  it('채팅에서 Opus를 선택해도 별도 JSON 생성은 Sonnet 5.5를 사용한다', async () => {
    // 왜: 내부 문서 생성도 5.5로 옮기되 채팅 선택값으로 모델 계열이 바뀌면 안 된다.
    await claudeChat('도와주세요', [], '안녕', 0.7, 'test', { modelSettings: { model: 'claude-opus-5-5', effort: 'high', thinking: 'adaptive' } })
    await claudeJSON('JSON', '생성')
    expect(sdk.json.mock.calls[0][0].model).toBe('claude-sonnet-5-5')
    expect(sdk.json.mock.calls[0][0]).toMatchObject({ thinking: { type: 'adaptive' }, max_tokens: 32000 })
    expect(sdk.json.mock.calls[0][0]).not.toHaveProperty('temperature')
  })
  it('JSON 생성에 사고 블록이 있으면 본문만 해석하고 잘린 결과는 거절한다', async () => {
    // 왜: 5.5의 사고 블록을 JSON으로 해석하거나 한도에서 잘린 문서를 완성본으로 쓰면 안 된다.
    sdk.json.mockResolvedValueOnce(answer([
      { type: 'thinking', thinking: 'test only', signature: 'opaque' },
      { type: 'text', text: '{"ok":' }, { type: 'text', text: 'true}' },
    ]))
    await expect(claudeJSON('JSON', '생성')).resolves.toEqual({ ok: true })
    sdk.json.mockResolvedValueOnce(answer([{ type: 'text', text: '{"ok":true}' }], 'max_tokens'))
    await expect(claudeJSON('JSON', '생성')).rejects.toThrow(/output limit/i)
  })
})
