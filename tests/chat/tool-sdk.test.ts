// 도구 호출과 실제 결과를 다음 대화까지 보존하고 일반 채팅과 중단 동작을 유지한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeChat } from '@/lib/claude'
import { prepareChatTools, type ToolBlock } from '@/lib/chat-tools/protocol'

const sdk = vi.hoisted(() => ({ chat: vi.fn(), json: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create: sdk.chat } }
    messages = { create: sdk.json }
  },
}))
vi.mock('@/lib/timing', () => ({ logTiming: vi.fn() }))

function response(content: ToolBlock[], stopReason = 'end_turn') {
  return {
    model: 'claude-sonnet-4-6', content, stop_reason: stopReason,
    usage: { input_tokens: 31, output_tokens: 12, cache_read_input_tokens: 7, cache_creation_input_tokens: 0 },
  }
}

beforeEach(() => {
  sdk.chat.mockReset().mockResolvedValue(response([{ type: 'text', text: '설정을 확인했어요.' }]))
  sdk.json.mockReset().mockRejectedValue(new Error('이 채팅에서 별도 JSON 생성은 요청하지 않았다'))
})
afterEach(() => {
  expect(sdk.json).not.toHaveBeenCalled()
})

describe('모델과 채팅 도구의 연결', () => {
  it('말 없이 조회를 요청한 응답도 오류 없이 다음 실행으로 넘긴다', async () => {
    // 왜: 모델이 설명 문장 없이 도구만 선택한 정상 응답을 텍스트 오류로 버리면 안 된다.
    const appTools = prepareChatTools('producer', true, [])!
    const content = [{ type: 'tool_use', id: 'read-1', name: 'read_project', input: { resource: 'settings' } }]
    const onUsage = vi.fn()
    sdk.chat.mockResolvedValueOnce(response(content, 'tool_use'))

    const text = await claudeChat('제작을 도와주세요.', [], '현재 언어를 확인해줘', 0.5, 'chat-test', { appTools, onUsage })

    expect(text).toBe('')
    expect(appTools.turn).toEqual({ content, stopReason: 'tool_use' })
    expect(sdk.chat).toHaveBeenCalledTimes(1)
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-sonnet-4-6', inputTokens: 31, outputTokens: 12, stopReason: 'tool_use',
    }))
  })

  it('조회 결과를 다음 대화에 넘길 때 원래 응답과 검색 결과의 순서를 보존한다', async () => {
    // 왜: 실행 결과가 어떤 요청의 답인지 잃거나 검색과 앱 조작 중 하나가 빠지면 후속 판단이 틀어진다.
    const history = [{ role: 'user' as const, content: '고등학교 이야기야.' }, { role: 'model' as const, content: '설정을 함께 정해볼게요.' }]
    const message = '참고할 작품을 찾고 현재 대사 언어도 알려줘'
    const content: ToolBlock[] = [
      { type: 'text', text: '작품과 설정을 확인할게요.' },
      { type: 'server_tool_use', id: 'search-1', name: 'web_search', input: { query: 'school film' } },
      { type: 'web_search_tool_result', tool_use_id: 'search-1', content: [] },
      { type: 'tool_use', id: 'read-1', name: 'read_project', input: { resource: 'settings' } },
    ]
    sdk.chat.mockResolvedValueOnce(response(content, 'tool_use'))
    const firstTools = prepareChatTools('producer', true, [])!
    await claudeChat('제작을 도와주세요.', history, message, 0.5, 'chat-test', { appTools: firstTools, webSearch: true })
    expect(firstTools.turn).toEqual({ content, stopReason: 'tool_use' })
    const results: ToolBlock[] = [{
      type: 'tool_result', tool_use_id: 'read-1',
      content: JSON.stringify({ status: 'ok', records: [{ id: 'settings', values: { dialogueLanguage: 'ja' }, revision: 'r1' }] }),
    }]
    const continuation = [
      { role: 'assistant', content: firstTools.turn!.content },
      { role: 'user', content: results },
    ]
    const nextTools = prepareChatTools('producer', true, continuation)!

    await claudeChat('제작을 도와주세요.', history, message, 0.5, 'chat-test', { appTools: nextTools, webSearch: true })

    expect(sdk.chat).toHaveBeenCalledTimes(2)
    const request = sdk.chat.mock.calls[1][0]
    expect(request.messages).toEqual([
      { role: 'user', content: history[0].content },
      { role: 'assistant', content: history[1].content },
      { role: 'user', content: message },
      ...continuation,
    ])
    expect(request.tools.map((tool: { name: string }) => tool.name)).toEqual(['web_search', 'read_project', 'edit_project'])
    expect(nextTools.turn).toBeUndefined()
  })

  it('검색이 잠시 멈춘 응답도 전체 내용을 보존해 이어갈 수 있다', async () => {
    // 왜: 앱 도구 호출 없이 검색만 일시 중단된 응답도 계속할 문맥을 잃으면 안 된다.
    const content: ToolBlock[] = [
      { type: 'text', text: '자료를 확인하고 있어요.' },
      { type: 'server_tool_use', id: 'search-2', name: 'web_search', input: { query: 'film reference' } },
      { type: 'web_search_tool_result', tool_use_id: 'search-2', content: [] },
    ]
    sdk.chat.mockResolvedValueOnce(response(content, 'pause_turn'))
    const appTools = prepareChatTools('producer', true, [])!

    const text = await claudeChat('제작을 도와주세요.', [], '비슷한 작품을 찾아줘', 0.5, 'chat-test', { appTools, webSearch: true })

    expect(text).toBe('자료를 확인하고 있어요.')
    expect(appTools.turn).toEqual({ content, stopReason: 'pause_turn' })
  })

  it('도구를 켜지 않은 일반 대화는 기존처럼 답변을 돌려준다', async () => {
    // 왜: 도구 기능을 사용하는 채팅을 추가해도 기존 호출자의 응답과 요청 조건을 바꾸면 안 된다.
    sdk.chat.mockResolvedValueOnce(response([
      { type: 'text', text: '주인공의 목표는 ' },
      { type: 'text', text: '무엇인가요?' },
    ]))
    const appTools = prepareChatTools('producer', false, [])

    const text = await claudeChat('기존 제작 안내', [], '이야기를 같이 생각해줘', 0.5, 'plain-test', { appTools })

    expect(appTools).toBeUndefined()
    expect(text).toBe('주인공의 목표는 무엇인가요?')
    expect(sdk.chat.mock.calls[0][0].system).toBe('기존 제작 안내')
    expect(sdk.chat.mock.calls[0][0].tools).toBeUndefined()
  })

  it('요청을 중단하면 기다리던 모델 호출에도 중단을 전달한다', async () => {
    // 왜: 화면에서 중단해도 공급자 요청이 계속 기다리는 상태로 남으면 안 된다.
    const controller = new AbortController()
    const appTools = prepareChatTools('producer', true, [])!
    sdk.chat.mockImplementationOnce((_body: unknown, options: { signal?: AbortSignal }) => {
      expect(options.signal).toBe(controller.signal)
      return new Promise((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => reject(new DOMException('중단됨', 'AbortError')), { once: true })
      })
    })

    const pending = claudeChat('제작을 도와주세요.', [], '설정을 확인해줘', 0.5, 'chat-test', { appTools, signal: controller.signal })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()

    await rejected
    expect(sdk.chat).toHaveBeenCalledTimes(1)
    expect(sdk.chat.mock.calls[0][1].signal).toBe(controller.signal)
    expect(appTools.turn).toBeUndefined()
  })
})
