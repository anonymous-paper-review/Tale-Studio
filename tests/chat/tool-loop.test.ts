// 채팅 도구의 실제 결과를 모델에 돌려주고 중복 실행·반복 실패·중단 뒤 실행을 막는다.
import { describe, expect, it, vi } from 'vitest'
import { runChatToolLoop } from '@/lib/chat-tools/loop'

type Call = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type Block = { type: string; [key: string]: unknown }
type Reply = { reply?: string; toolTurn?: { content: Block[]; stopReason: string }; [key: string]: unknown }

const call = (id: string, input: Record<string, unknown> = {}, name = 'edit_settings'): Call => ({
  type: 'tool_use', id, name, input,
})
const turn = (content: Block[], stopReason = 'tool_use'): Reply => ({ toolTurn: { content, stopReason } })

function sequence(responses: Reply[]) {
  const sent: unknown[][] = []
  const queue = [...responses]
  const request = vi.fn(async (messages: unknown[]) => {
    sent.push(structuredClone(messages))
    const next = queue.shift()
    if (!next) throw new Error('이 테스트가 준비하지 않은 추가 모델 요청')
    return next
  })
  return { request, sent }
}

function scope() {
  return { signal: new AbortController().signal, isCurrent: () => true }
}

function payload(block: { content?: unknown }): unknown {
  const content = block.content
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(item => typeof item?.text === 'string' ? item.text : '').join('')
      : ''
  return JSON.parse(text)
}

describe('채팅 도구 실행 왕복', () => {
  it('도구가 없는 일반 대화는 변경 없이 답변을 돌려준다', async () => {
    // 왜: 정상 상담에서 설정 저장이나 다른 도구 실행을 강제하면 안 된다.
    const data = { reply: '주인공은 어떤 성격인가요?', choices: ['차분함', '활발함'] }
    const { request } = sequence([data])
    const execute = vi.fn()
    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(result.data).toEqual(data)
    expect(result.results).toEqual([])
    expect(result.stopped).toBeUndefined()
    expect(request).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
  })

  it('명시한 수정 요청에 도구 없이 불가라고 답하면 한 번 실행을 재확인해 실제 조회와 변경으로 이어간다', async () => {
    // 왜: 앱이 지원하는 수정을 모델이 없다고 오인해도 실제 도구를 확인하고 요청을 수행할 기회를 준다.
    const firstReply = '이 앱에서는 설정을 바꿀 수 없어요.'
    const read = call('read-settings', { resource: 'settings' }, 'read_project')
    const edit = call('edit-settings', { resource: 'settings', id: 'settings', revision: 'r1', patch: { dialogueLanguage: 'ko' } }, 'edit_project')
    const { request, sent } = sequence([
      { toolSupport: true, reply: firstReply },
      turn([read, edit]),
      { toolSupport: true, reply: '설정을 한국어로 저장했어요.' },
    ])
    const execute = vi.fn(async (_tool: unknown) => ({ status: 'ok' }))

    const result = await runChatToolLoop({ request, execute, requireEdit: true, ...scope() })

    expect(request).toHaveBeenCalledTimes(3)
    expect(execute.mock.calls.map(([tool]) => tool)).toEqual([read, edit])
    const checkMessages = sent[1] as Array<{ role: string; content: Block[] }>
    expect(checkMessages).toHaveLength(2)
    expect(checkMessages[0]).toEqual({ role: 'assistant', content: [{ type: 'text', text: firstReply }] })
    expect(checkMessages[1].role).toBe('user')
    expect(checkMessages[1].content).toEqual([{ type: 'text', text: expect.any(String) }])
    const lastMessages = sent[2] as Array<{ role: string; content: Block[] }>
    expect(lastMessages.filter(message => message.role === 'user' && message.content.some(block => block.type === 'text'))).toHaveLength(1)
    expect(result.stopped).toBeUndefined()
    expect(result.data.reply).toBe('설정을 한국어로 저장했어요.')
  })

  it('실행을 재확인한 뒤에도 수정 도구를 쓰지 않으면 완료 주장을 중단하고 옛 변경 필드를 반환하지 않는다', async () => {
    // 왜: 실행하지 않은 완료 발화와 남은 JSON이 기존 적용 경로에서 뒤늦게 변경을 일으키면 안 된다.
    const unsupportedFinal: Reply = {
      toolSupport: true,
      reply: '모든 변경을 완료했어요.',
      extractedSettings: { dialogueLanguage: 'ko' },
      updates: [{ type: 'updateShot', id: 'shot-one', patch: { actionDescription: '변경' } }],
      proposals: [{ characterId: 'character-one', appearance: '변경' }],
      locationProposals: [{ locationId: 'location-one', visualDescription: '변경' }],
      appearanceCreations: [{ characterId: 'character-one', label: '새 모습' }],
      locationAppearanceCreations: [{ locationId: 'location-one', label: '새 모습' }],
    }
    const { request } = sequence([unsupportedFinal, unsupportedFinal])
    const execute = vi.fn()

    const result = await runChatToolLoop({ request, execute, requireEdit: true, ...scope() })

    expect(request).toHaveBeenCalledTimes(2)
    expect(execute).not.toHaveBeenCalled()
    expect(result.results).toEqual([])
    expect(result.stopped).toBe('no_edit')
    expect(result.data.reply).toBeTruthy()
    expect(result.data.reply).not.toBe('모든 변경을 완료했어요.')
    for (const field of ['extractedSettings', 'updates', 'proposals', 'locationProposals', 'appearanceCreations', 'locationAppearanceCreations']) {
      expect(result.data).not.toHaveProperty(field)
    }
  })

  it('한 응답의 변경과 조회를 순서대로 실행하고 전체 응답과 실제 결과를 모델에 돌려준다', async () => {
    // 왜: 병렬 실행하면 조회가 변경 전 값을 읽고, 텍스트만 보관하면 native 도구 문맥을 잃는다.
    const edit = call('edit-1', { dialogueLanguage: 'ko' })
    const read = call('read-1', {}, 'read_settings')
    const content: Block[] = [
      { type: 'text', text: '설정을 확인하겠습니다.' },
      { type: 'server_tool_use', id: 'web-1', name: 'web_search', input: { query: 'reference' } },
      { type: 'web_search_tool_result', tool_use_id: 'web-1', content: [] },
      edit,
      read,
    ]
    const { request, sent } = sequence([turn(content), { reply: '한국어로 저장된 것을 확인했어요.' }])
    let language = 'ja'
    const order: string[] = []
    const execute = vi.fn(async (tool: { id: string; name: string; input: unknown }) => {
      order.push(`${tool.id}:start`)
      if (tool.name === 'edit_settings') {
        await Promise.resolve()
        language = String((tool.input as Record<string, unknown>).dialogueLanguage)
      }
      order.push(`${tool.id}:end`)
      return { status: 'ok', settings: { dialogueLanguage: language } }
    })

    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(order).toEqual(['edit-1:start', 'edit-1:end', 'read-1:start', 'read-1:end'])
    expect(execute).toHaveBeenCalledTimes(2)
    expect(sent[0]).toEqual([])
    const messages = sent[1] as Array<{ role: string; content: Array<{ type: string; tool_use_id?: string; is_error?: boolean; content?: unknown }> }>
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ role: 'assistant', content })
    expect(messages[1].role).toBe('user')
    expect(messages[1].content.map(block => [block.type, block.tool_use_id])).toEqual([
      ['tool_result', 'edit-1'], ['tool_result', 'read-1'],
    ])
    expect(messages[1].content.map(payload)).toEqual([
      { status: 'ok', settings: { dialogueLanguage: 'ko' } },
      { status: 'ok', settings: { dialogueLanguage: 'ko' } },
    ])
    expect(messages[1].content.every(block => block.is_error !== true)).toBe(true)
    expect(result.results).toEqual([
      { call: edit, result: { status: 'ok', settings: { dialogueLanguage: 'ko' } } },
      { call: read, result: { status: 'ok', settings: { dialogueLanguage: 'ko' } } },
    ])
    expect(result.data.reply).toContain('확인')
  })

  it.each([
    ['ok', false],
    ['approval_required', false],
    ['failed', true],
    ['invalid_input', true],
  ])('실행 결과가 %s이면 성공과 승인 대기를 실패와 구분해 모델에 전달한다', async (status, isError) => {
    // 왜: 승인 대기를 오류로 오인해 재실행하거나 저장 실패를 성공으로 보고하면 안 된다.
    const { request, sent } = sequence([turn([call('one')]), { reply: '실행 결과를 확인했어요.' }])
    const execute = vi.fn(async () => ({ status, message: '결과 설명' }))
    await runChatToolLoop({ request, execute, ...scope() })
    const resultMessage = sent[1][1] as { role: string; content: Array<{ is_error?: boolean; content?: unknown }> }
    expect(resultMessage.role).toBe('user')
    expect(resultMessage.content[0].is_error === true).toBe(isError)
    expect(payload(resultMessage.content[0])).toEqual({ status, message: '결과 설명' })
  })

  it('같은 도구 번호와 같은 입력을 다시 받으면 실행을 반복하지 않고 이전 결과를 돌려준다', async () => {
    // 왜: 모델 응답이나 후속 요청이 반복되어도 같은 변경을 중복 실행하면 안 된다.
    const repeated = call('same-id', { dialogueLanguage: 'ko' })
    const { request, sent } = sequence([turn([repeated]), turn([repeated]), { reply: '저장 결과를 확인했어요.' }])
    const execute = vi.fn(async () => ({ status: 'ok', saved: { dialogueLanguage: 'ko' } }))
    await runChatToolLoop({ request, execute, ...scope() })

    expect(execute).toHaveBeenCalledTimes(1)
    const messages = sent[2] as Array<{ role: string; content: Array<{ content?: unknown }> }>
    expect(messages).toHaveLength(4)
    expect(payload(messages[1].content[0])).toEqual(payload(messages[3].content[0]))
  })

  it('이미 사용한 도구 번호에 다른 입력이 오면 새 변경을 실행하지 않고 잘못된 입력으로 알린다', async () => {
    // 왜: 한 도구 번호를 다른 설정 변경에 재사용하면 중복 방지가 엉뚱한 변경을 허용할 수 있다.
    const { request, sent } = sequence([
      turn([call('same-id', { dialogueLanguage: 'ko' })]),
      turn([call('same-id', { dialogueLanguage: 'ja' })]),
      { reply: '두 번째 요청의 입력을 확인해 주세요.' },
    ])
    const execute = vi.fn(async () => ({ status: 'ok' }))
    await runChatToolLoop({ request, execute, ...scope() })

    expect(execute).toHaveBeenCalledTimes(1)
    const messages = sent[2] as Array<{ content: Array<{ is_error?: boolean; content?: unknown }> }>
    expect(payload(messages[3].content[0])).toMatchObject({ status: 'invalid_input' })
    expect(messages[3].content[0].is_error).toBe(true)
  })

  it('도구 번호를 바꿔도 같은 대상과 입력의 실패가 두 번 반복되면 더 실행하지 않는다', async () => {
    // 왜: 모델이 매번 새 번호로 같은 실패를 재시도해 요청과 비용을 계속 늘리면 안 된다.
    const { request } = sequence([
      turn([call('first', { target: 'settings', dialogueLanguage: 'ko' })]),
      turn([call('second', { target: 'settings', dialogueLanguage: 'ko' })]),
      turn([call('third', { target: 'settings', dialogueLanguage: 'ko' })]),
      { reply: '모두 완료했어요.' },
    ])
    const execute = vi.fn(async () => ({ status: 'failed', message: '저장 실패' }))
    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(result.stopped).toBe('limit')
    expect(result.data.reply).toBeTruthy()
    expect(result.data.reply).not.toBe('모두 완료했어요.')
  })

  it('서로 다른 대상의 실패는 같은 실패의 반복으로 합산하지 않는다', async () => {
    // 왜: 한 대상의 실패 때문에 별개의 대상에 대한 첫 요청까지 막으면 안 된다.
    const { request } = sequence([
      turn([call('a', { target: 'first' }), call('b', { target: 'second' })]),
      { reply: '두 대상의 실패 원인을 확인해 주세요.' },
    ])
    const execute = vi.fn(async () => ({ status: 'failed', message: '저장 실패' }))
    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(result.stopped).toBeUndefined()
    expect(result.data.reply).toContain('두 대상')
  })

  it('조회 토큰과 속성 순서만 바꾸어도 같은 변경의 실패 재시도 한도를 넘지 않는다', async () => {
    // 왜: 다시 읽을 때마다 달라지는 조회 토큰으로 같은 저장 실패의 횟수 제한을 우회하면 안 된다.
    const { request } = sequence([
      turn([call('one', { resource: 'settings', id: 'settings', revision: 'r1', patch: { dialogueLanguage: 'ko', tone: ['warm'] } }, 'edit_project')]),
      turn([call('two', { revision: 'r2', id: 'settings', resource: 'settings', patch: { tone: ['warm'], dialogueLanguage: 'ko' } }, 'edit_project')]),
      turn([call('three', { resource: 'settings', id: 'settings', revision: 'r3', patch: { dialogueLanguage: 'ko', tone: ['warm'] } }, 'edit_project')]),
      { reply: '모두 완료했어요.' },
    ])
    const execute = vi.fn(async () => ({ status: 'failed', message: '동일한 저장 실패' }))
    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(result.stopped).toBe('limit')
    expect(result.data.reply).not.toBe('모두 완료했어요.')
  })

  it('정한 반복 실패 횟수에 도달하면 그 입력은 더 실행하지 않는다', async () => {
    // 왜: 호출자가 정한 실패 재시도 한도를 기본값으로 무시하면 안 된다.
    const { request } = sequence([
      turn([call('one', { target: 'a' })]),
      turn([call('two', { target: 'a' })]),
      turn([call('three', { target: 'a' })]),
    ])
    const execute = vi.fn(async () => ({ status: 'failed' }))
    const result = await runChatToolLoop({ request, execute, maxSameFailure: 1, ...scope() })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.stopped).toBe('limit')
  })

  it('모델 왕복이 기본 여섯 번을 넘으려 하면 완료를 주장하지 않고 중단한다', async () => {
    // 왜: 도구 요청이 끝없이 이어져도 대화가 무한히 실행되면 안 된다.
    let count = 0
    const request = vi.fn(async () => {
      count++
      return { ...turn([call(`step-${count}`, { value: count })]), reply: '모두 저장했어요.' }
    })
    const execute = vi.fn(async () => ({ status: 'ok' }))
    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(request).toHaveBeenCalledTimes(6)
    expect(result.stopped).toBe('limit')
    expect(result.data.reply).toBeTruthy()
    expect(result.data.reply).not.toBe('모두 저장했어요.')
    expect(result.data.reply).toMatch(/한도|제한|중단|반복|limit|stop/i)
  })

  it('한 응답에 도구가 여러 개 있어도 정한 실행 개수를 넘지 않는다', async () => {
    // 왜: 모델 왕복 한도만 두면 한 번의 응답으로 실행 개수 제한을 우회할 수 있다.
    const { request } = sequence([turn([call('one'), call('two')]), { reply: '모두 완료했어요.' }])
    const execute = vi.fn(async () => ({ status: 'ok' }))
    const result = await runChatToolLoop({ request, execute, maxCalls: 1, ...scope() })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.stopped).toBe('limit')
    expect(result.data.reply).not.toBe('모두 완료했어요.')
  })

  it('모델이 잠시 멈추면 전체 응답을 이어 보내고 없는 도구 결과를 만들지 않는다', async () => {
    // 왜: 서버 검색 중 잠시 멈춘 응답에는 앱 도구 실행 결과를 지어내 붙이면 안 된다.
    const content: Block[] = [
      { type: 'text', text: '참고 자료를 찾고 있어요.' },
      { type: 'server_tool_use', id: 'search-one', name: 'web_search', input: { query: 'reference' } },
      { type: 'web_search_tool_result', tool_use_id: 'search-one', content: [] },
    ]
    const { request, sent } = sequence([turn(content, 'pause_turn'), { reply: '찾은 자료를 정리했어요.' }])
    const execute = vi.fn()
    const result = await runChatToolLoop({ request, execute, ...scope() })

    expect(sent[1]).toEqual([{ role: 'assistant', content }])
    expect(execute).not.toHaveBeenCalled()
    expect(result.results).toEqual([])
    expect(result.data.reply).toContain('정리')
  })

  it.each(['중단 요청', '프로젝트 전환'])('%s 상태에서는 모델 요청과 도구 실행을 시작하지 않는다', async (reason) => {
    // 왜: 이미 끝난 세션의 요청이 다시 실행되거나 다른 프로젝트를 바꾸면 안 된다.
    const controller = new AbortController()
    if (reason === '중단 요청') controller.abort()
    const request = vi.fn()
    const execute = vi.fn()
    await expect(runChatToolLoop({
      request, execute, signal: controller.signal, isCurrent: () => reason !== '프로젝트 전환',
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(request).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('모델 응답을 기다리다 중단하면 늦게 도착한 도구를 실행하지 않는다', async () => {
    // 왜: 중단 시점에 이미 보낸 모델 요청이 끝나더라도 새로운 쓰기를 시작하면 안 된다.
    const controller = new AbortController()
    let resolve!: (response: Reply) => void
    const request = vi.fn(() => new Promise<Reply>(done => { resolve = done }))
    const execute = vi.fn()
    const running = runChatToolLoop({ request, execute, signal: controller.signal, isCurrent: () => true })
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    controller.abort()
    resolve(turn([call('late')]))
    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    expect(request).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
  })

  it.each(['중단 요청', '프로젝트 전환'])('도구 실행을 기다리다 %s가 생기면 뒤의 쓰기와 모델 요청을 하지 않는다', async (reason) => {
    // 왜: 첫 저장이 늦게 끝난 뒤 남은 변경이 새 프로젝트나 중단된 대화에서 실행되면 안 된다.
    const controller = new AbortController()
    let current = true
    let finish!: (result: { status: string }) => void
    const { request } = sequence([turn([call('first'), call('second')]), { reply: '모두 저장했어요.' }])
    const execute = vi.fn(() => new Promise<{ status: string }>(done => { finish = done }))
    const running = runChatToolLoop({ request, execute, signal: controller.signal, isCurrent: () => current })
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    if (reason === '중단 요청') controller.abort()
    else current = false
    finish({ status: 'ok' })
    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
