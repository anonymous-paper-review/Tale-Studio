// 채팅 출력이 잘리면 안전한 본문만 이어 쓰고 불완전한 변경은 실행하지 않는다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeChat } from '@/lib/claude'
import { ChatOutputRecoveryError } from '@/lib/chat-output-recovery'
import { prepareChatTools } from '@/lib/chat-tools/protocol'

const sdk = vi.hoisted(() => ({ chat: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  beta = { messages: { stream: (...args: unknown[]) => ({ finalMessage: () => sdk.chat(...args) }) } }
} }))
vi.mock('@/lib/timing', () => ({ logTiming: vi.fn() }))

const response = (content: unknown[], stop_reason = 'end_turn', output_tokens = 20) => ({
  model: 'claude-sonnet-5-5', content, stop_reason,
  usage: { input_tokens: 100, output_tokens, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 },
})
const text = (value: string, stop = 'end_turn', output = 20) => response([{ type: 'text', text: value }], stop, output)
const recovery = { maxAttempts: 2, maxOutputTokens: 320000 }
const call = (opts: NonNullable<Parameters<typeof claudeChat>[5]> = {}) =>
  claudeChat('사용자의 작업을 마치세요.', [], '긴 답변을 작성해줘.', 0.7, 'recovery-test', { recovery, ...opts })

beforeEach(() => sdk.chat.mockReset().mockResolvedValue(text('완성된 답변')))

describe('같이 정한 채팅 출력 복구 동작', () => {
  it('자동 복구를 사용하는 채팅이면 첫 응답에 64K 출력 공간을 둔다', async () => {
    // 왜: 사고와 답변이 공유하는 출력 공간을 늘려 불필요한 중단을 줄인다.
    await expect(call()).resolves.toBe('완성된 답변')
    expect(sdk.chat.mock.calls[0][0].max_tokens).toBe(64000)
  })

  it('일반 답변이 출력 한도로 잘리면 앞부분을 보존하고 이어 쓴다', async () => {
    // 왜: 사용자가 계속해 달라고 다시 입력하지 않아도 미완성 문장을 마쳐야 한다.
    const blocks = [
      { type: 'thinking', thinking: '계획', signature: 'signed-original' },
      { type: 'redacted_thinking', data: 'opaque' },
      { type: 'text', text: '첫 문장과 ' },
    ]
    sdk.chat.mockResolvedValueOnce(response(blocks, 'max_tokens', 64000)).mockResolvedValueOnce(text('둘째 문장.'))
    const onUsage = vi.fn()
    const onRecovery = vi.fn()
    await expect(call({ onUsage, recovery: { ...recovery, onRecovery } })).resolves.toBe('첫 문장과 둘째 문장.')
    const second = sdk.chat.mock.calls[1][0]
    expect(second.max_tokens).toBe(128000)
    expect(second.messages.slice(-2)).toEqual([
      { role: 'assistant', content: blocks },
      { role: 'user', content: expect.stringContaining('continue') },
    ])
    expect(onUsage.mock.calls.map(([usage]) => usage.outputTokens)).toEqual([64000, 20])
    expect(onRecovery).toHaveBeenCalledWith({ attempt: 1, mode: 'continue' })
  })

  it('불완전한 도구 요청이면 실행에 넘기지 않고 같은 단계를 더 큰 한도로 다시 생성한다', async () => {
    // 왜: 한도에서 잘린 도구 인수로 저장하거나 도구를 중복 실행하면 안 된다.
    const appTools = prepareChatTools('producer', true, [])!
    const complete = { type: 'tool_use', id: 'complete', name: 'edit_project', input: { resource: 'settings' } }
    sdk.chat.mockResolvedValueOnce(response([
      { type: 'text', text: '수정할게요.' },
      { type: 'tool_use', id: 'partial', name: 'edit_project', input: {} },
    ], 'max_tokens', 64000)).mockResolvedValueOnce(response([complete], 'tool_use'))
    const onRecovery = vi.fn(() => expect(appTools.turn).toBeUndefined())
    await expect(call({ appTools, recovery: { ...recovery, onRecovery } })).resolves.toBe('')
    expect(sdk.chat.mock.calls[1][0].messages).toEqual(sdk.chat.mock.calls[0][0].messages)
    expect(appTools.turn?.content).toEqual([complete])
    expect(onRecovery).toHaveBeenCalledWith({ attempt: 1, mode: 'retry' })
  })

  it('설정이나 변경 정보가 섞인 답변이 잘리면 부분 변경을 이어 붙이지 않고 다시 생성한다', async () => {
    // 왜: Producer 설정과 Writer·Artist 변경 목록이 중간에서 잘리면 완성된 결과만 검증해야 한다.
    for (const partial of [
      '설명을 적었어요.\n```json\n{"updates":[{"type":"addScene"',
      '설명을 적었어요.\n{"extractedSettings":{"styleAnchorKey":"real"',
      '{"reply":"설명을 적었어요","updates":',
      '설명을 적었어요.\n<tool_call>{"name":',
    ]) {
      sdk.chat.mockReset().mockResolvedValueOnce(text(partial, 'max_tokens')).mockResolvedValueOnce(text('최종 설명.\n```json\n{"updates":[]}\n```'))
      await expect(call()).resolves.toBe('최종 설명.\n```json\n{"updates":[]}\n```')
      expect(sdk.chat.mock.calls[1][0].messages).toEqual(sdk.chat.mock.calls[0][0].messages)
    }
  })

  it('추가 복구를 두 번 사용해도 끝나지 않으면 완료로 처리하지 않고 안전한 본문을 남긴다', async () => {
    // 왜: 무한 호출을 막으면서 사용자가 이미 작성된 내용을 잃지 않게 한다.
    sdk.chat.mockResolvedValueOnce(text('첫째. ', 'max_tokens')).mockResolvedValueOnce(text('둘째. ', 'max_tokens')).mockResolvedValueOnce(text('셋째.', 'max_tokens'))
    const onUsage = vi.fn()
    const onRecovery = vi.fn()
    await expect(call({ onUsage, recovery: { ...recovery, onRecovery } })).rejects.toMatchObject({
      name: 'ChatOutputRecoveryError', reason: 'output_limit', partialText: '첫째. 둘째. 셋째.',
    })
    expect(sdk.chat).toHaveBeenCalledTimes(3)
    expect(onUsage).toHaveBeenCalledTimes(3)
    expect(onRecovery.mock.calls.map(([event]) => event.attempt)).toEqual([1, 2])
  })

  it('중단 버튼을 누르면 자동 복구 알림 뒤에도 다음 호출을 시작하지 않는다', async () => {
    // 왜: 복구 안내를 처리하는 사이에 취소한 요청이 추가 비용을 발생시키면 안 된다.
    const controller = new AbortController()
    sdk.chat.mockResolvedValueOnce(text('미완성', 'max_tokens'))
    const onRecovery = vi.fn(async () => { controller.abort() })
    await expect(call({ signal: controller.signal, recovery: { ...recovery, onRecovery } })).rejects.toMatchObject({ name: 'AbortError' })
    expect(sdk.chat).toHaveBeenCalledTimes(1)
  })
})

describe('혼자 정한 안전한 복구 경계 — 모두 쉽게 되돌릴 수 있는 구현 선택', () => {
  it('출력 예산을 모두 쓰면 추가 호출 없이 안전한 부분 답변과 중단 이유를 남긴다', async () => {
    // 왜: 정상 도구 호출과 복구 호출이 공유하는 남은 예산을 이 호출에서도 지켜야 한다.
    sdk.chat.mockResolvedValueOnce(text('부분 답변', 'max_tokens', 100))
    await expect(call({ recovery: { ...recovery, maxOutputTokens: 100 } })).rejects.toMatchObject({ reason: 'output_budget', partialText: '부분 답변' })
    expect(sdk.chat.mock.calls[0][0].max_tokens).toBe(100)
    expect(sdk.chat).toHaveBeenCalledTimes(1)
  })

  it('복구 호출의 남은 출력 예산이 128K보다 작으면 남은 만큼만 요청한다', async () => {
    // 왜: 이전 호출의 실제 사용량을 빼지 않으면 요청 전체의 비용 제한을 넘을 수 있다.
    sdk.chat.mockResolvedValueOnce(text('앞', 'max_tokens', 64000)).mockResolvedValueOnce(text('뒤', 'end_turn', 10))
    await expect(call({ recovery: { ...recovery, maxOutputTokens: 70000 } })).resolves.toBe('앞뒤')
    expect(sdk.chat.mock.calls[1][0].max_tokens).toBe(6000)
  })

  it('복구를 허용하지 않았거나 한도를 비정상적으로 크게 보내도 추가 호출은 두 번을 넘지 않는다', async () => {
    // 왜: 클라이언트가 잘못 보낸 숫자가 무한 복구나 무제한 출력 요청을 만들면 안 된다.
    for (const maxAttempts of [0, -1, Number.NaN, 99]) {
      sdk.chat.mockReset().mockResolvedValue(text('부분', 'max_tokens', 64000))
      await expect(call({ recovery: { maxAttempts, maxOutputTokens: 999999 } })).rejects.toBeInstanceOf(ChatOutputRecoveryError)
      expect(sdk.chat).toHaveBeenCalledTimes(maxAttempts === 99 ? 3 : 1)
      expect(sdk.chat.mock.calls.map(([request]) => request.max_tokens)).toEqual(maxAttempts === 99 ? [64000, 128000, 128000] : [64000])
    }
  })

  it('출력 예산이 없거나 잘못된 값이면 모델 호출을 시작하지 않는다', async () => {
    // 왜: 이미 소진된 요청에서 새 호출을 시작하면 상위 비용 제한을 우회한다.
    for (const maxOutputTokens of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(call({ recovery: { ...recovery, maxOutputTokens } })).rejects.toMatchObject({ reason: 'output_budget', partialText: '' })
    }
    expect(sdk.chat).not.toHaveBeenCalled()
  })

  it('복구가 끝내 실패하면 도구 인수와 변경 목록을 부분 답변에 노출하지 않는다', async () => {
    // 왜: 실패한 변경 정보가 화면이나 다음 턴에서 완료된 변경으로 해석되면 안 된다.
    sdk.chat.mockResolvedValue(text('안전한 설명.\n```json\n{"updates":[{"type":"addScene"', 'max_tokens'))
    await expect(call()).rejects.toMatchObject({ partialText: '안전한 설명.\n', reason: 'output_limit' })
  })

  it('사고만 하다가 잘리거나 서버 도구가 포함됐으면 본문 이어 쓰기 대신 같은 단계를 다시 생성한다', async () => {
    // 왜: 사용자에게 보여줄 본문이 없거나 서버 도구 연결이 불완전하면 임의 이어 쓰기가 안전하지 않다.
    for (const content of [
      [{ type: 'thinking', thinking: '계획', signature: 'original' }],
      [{ type: 'server_tool_use', id: 'search', name: 'web_search', input: { query: '자료' } }, { type: 'text', text: '검색 결과' }],
    ]) {
      sdk.chat.mockReset().mockResolvedValueOnce(response(content, 'max_tokens')).mockResolvedValueOnce(text('완성'))
      const onRecovery = vi.fn()
      await expect(call({ recovery: { ...recovery, onRecovery } })).resolves.toBe('완성')
      expect(onRecovery).toHaveBeenCalledWith({ attempt: 1, mode: 'retry' })
      expect(sdk.chat.mock.calls[1][0].messages).toEqual(sdk.chat.mock.calls[0][0].messages)
    }
  })

  it('기존 도구 실행 기록이 있으면 복구해도 원본 기록을 변경하지 않는다', async () => {
    // 왜: 상위 도구 반복 처리에서 완료한 결과가 지워지거나 변형되면 중복 저장을 유발할 수 있다.
    const messages = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'done', name: 'edit_project', input: { resource: 'settings' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'done', content: '{"status":"ok"}' }] },
    ]
    const appTools = prepareChatTools('producer', true, messages)!
    const before = structuredClone(appTools.messages)
    sdk.chat.mockResolvedValueOnce(text('앞', 'max_tokens')).mockResolvedValueOnce(text('뒤'))
    await expect(call({ appTools })).resolves.toBe('앞뒤')
    expect(appTools.messages).toEqual(before)
    expect(sdk.chat.mock.calls[0][0].messages).toHaveLength(3)
    expect(sdk.chat.mock.calls[1][0].messages).toHaveLength(5)
  })

  it('이미 중단했거나 사용량 기록 중 중단하면 다음 호출과 도구 전달을 하지 않는다', async () => {
    // 왜: 중단 시점이 모델 호출 전후 어느 쪽이어도 실행이 계속되면 안 된다.
    const first = new AbortController()
    first.abort()
    await expect(call({ signal: first.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(sdk.chat).not.toHaveBeenCalled()
    const second = new AbortController()
    const appTools = prepareChatTools('producer', true, [])!
    sdk.chat.mockResolvedValueOnce(response([{ type: 'tool_use', id: 'no', name: 'edit_project', input: {} }], 'tool_use'))
    await expect(call({ appTools, signal: second.signal, onUsage: () => second.abort() })).rejects.toMatchObject({ name: 'AbortError' })
    expect(appTools.turn).toBeUndefined()
    expect(sdk.chat).toHaveBeenCalledTimes(1)
  })

  it('출력 한도가 아닌 오류나 종료이면 자동으로 다시 호출하지 않는다', async () => {
    // 왜: 인증 실패나 내용 거절은 긴 출력 문제가 아니므로 비용을 써서 반복하지 않는다.
    sdk.chat.mockRejectedValueOnce(new Error('upstream unavailable'))
    await expect(call()).rejects.toThrow('upstream unavailable')
    expect(sdk.chat).toHaveBeenCalledTimes(1)
    sdk.chat.mockReset().mockResolvedValueOnce(text('이 작업은 도울 수 없어요.', 'refusal'))
    await expect(call()).resolves.toBe('이 작업은 도울 수 없어요.')
    expect(sdk.chat).toHaveBeenCalledTimes(1)
  })
})

describe('혼자 정한 이어 쓰기 도중 출력 형식 변경과 후속 실패 처리', () => {
  it('이어 쓰던 답변이 변경 정보나 도구 요청으로 바뀌면 원래 단계부터 완성본을 다시 생성한다', async () => {
    // 왜: 이어 쓴 본문과 마지막 호출의 변경 정보를 합치면 검증하지 않은 혼합 응답과 사고 기록이 남는다.
    for (const next of [
      text('뒷부분.\n```json\n{"updates":[]}\n```'),
      text('뒷부분.\n{"extractedSettings":{"styleAnchorKey":"real"}}', 'max_tokens'),
      response([{ type: 'tool_use', id: 'discard', name: 'edit_project', input: { resource: 'settings' } }], 'tool_use'),
    ]) {
      const appTools = prepareChatTools('producer', true, [])!
      const complete = [
        { type: 'thinking', thinking: '완성 단계', signature: 'original-step-signature' },
        { type: 'tool_use', id: 'complete', name: 'edit_project', input: { resource: 'settings' } },
      ]
      sdk.chat.mockReset().mockResolvedValueOnce(text('앞부분. ', 'max_tokens')).mockResolvedValueOnce(next).mockResolvedValueOnce(response(complete, 'tool_use'))
      const onRecovery = vi.fn(() => expect(appTools.turn).toBeUndefined())
      await expect(call({ appTools, recovery: { ...recovery, onRecovery } })).resolves.toBe('')
      expect(sdk.chat.mock.calls[1][0].messages).toHaveLength(3)
      expect(sdk.chat.mock.calls[2][0].messages).toEqual(sdk.chat.mock.calls[0][0].messages)
      expect(onRecovery.mock.calls).toEqual([[{ attempt: 1, mode: 'continue' }], [{ attempt: 2, mode: 'retry' }]])
      expect(appTools.turn?.content).toEqual(complete)
    }
  })

  it('이어 쓰기 중 변경 요청이 생겨도 복구 횟수나 예산이 없으면 변경을 실행에 넘기지 않는다', async () => {
    // 왜: 추가 복구를 못 하는 상황에서도 검증되지 않은 혼합 변경을 완료로 간주하면 안 된다.
    for (const options of [
      { maxAttempts: 1, maxOutputTokens: 320000, reason: 'output_limit' },
      { maxAttempts: 2, maxOutputTokens: 40, reason: 'output_budget' },
    ]) {
      const appTools = prepareChatTools('producer', true, [])!
      sdk.chat.mockReset().mockResolvedValueOnce(text('안전한 앞부분. ', 'max_tokens')).mockResolvedValueOnce(response([
        { type: 'text', text: '뒷부분.' },
        { type: 'tool_use', id: 'discard', name: 'edit_project', input: { resource: 'settings' } },
      ], 'tool_use'))
      await expect(call({ appTools, recovery: options })).rejects.toMatchObject({
        reason: options.reason, partialText: '안전한 앞부분. 뒷부분.',
      })
      expect(appTools.turn).toBeUndefined()
      expect(sdk.chat).toHaveBeenCalledTimes(2)
    }
  })

  it('자동 복구 중 문맥 한도에 도달하면 미완성 답변을 완료로 돌려주지 않는다', async () => {
    // 왜: 출력 상한과 별개인 문맥 한도 종료에서도 부분 변경을 저장하면 안 된다.
    const onUsage = vi.fn()
    const appTools = prepareChatTools('producer', true, [])!
    sdk.chat.mockResolvedValueOnce(text('앞부분. ', 'max_tokens')).mockResolvedValueOnce(text('뒷부분.\n```json\n{"updates":[', 'model_context_window_exceeded'))
    await expect(call({ appTools, onUsage })).rejects.toMatchObject({ reason: 'output_limit', partialText: '앞부분. 뒷부분.\n' })
    expect(appTools.turn).toBeUndefined()
    expect(sdk.chat).toHaveBeenCalledTimes(2)
    expect(onUsage).toHaveBeenCalledTimes(2)
  })

  it('이어 쓰기 도중 통신이 실패하면 이미 작성한 안전한 본문과 원래 오류를 남긴다', async () => {
    // 왜: 후속 호출 장애가 앞선 호출의 유효한 본문까지 지우면 사용자가 작업 내용을 잃는다.
    const failure = new Error('upstream unavailable')
    const onUsage = vi.fn()
    sdk.chat.mockResolvedValueOnce(text('보존할 본문.', 'max_tokens')).mockRejectedValueOnce(failure)
    await expect(call({ onUsage })).rejects.toMatchObject({
      name: 'ChatOutputRecoveryError', reason: 'request_failed', partialText: '보존할 본문.', cause: failure,
    })
    expect(sdk.chat).toHaveBeenCalledTimes(2)
    expect(onUsage).toHaveBeenCalledTimes(1)
  })

  it('변경 정보 때문에 처음부터 재생성하다 실패해도 이전의 안전한 본문은 남긴다', async () => {
    // 왜: 잘못된 혼합 응답을 폐기하는 과정에서 읽을 수 있는 부분까지 지워서는 안 된다.
    const failure = new Error('network disconnected')
    sdk.chat.mockResolvedValueOnce(text('앞부분. ', 'max_tokens')).mockResolvedValueOnce(text('뒷부분.\n{"updates":[]}')).mockRejectedValueOnce(failure)
    await expect(call()).rejects.toMatchObject({ reason: 'request_failed', partialText: '앞부분. 뒷부분.\n', cause: failure })
    expect(sdk.chat.mock.calls[2][0].messages).toEqual(sdk.chat.mock.calls[0][0].messages)
  })

  it('이어 쓰기 중 사용자가 중단하면 통신 실패로 바꾸거나 다시 호출하지 않는다', async () => {
    // 왜: 사용자의 중단은 출력 복구 실패와 구분하고 즉시 멈춰야 한다.
    const controller = new AbortController()
    sdk.chat.mockResolvedValueOnce(text('보존할 본문.', 'max_tokens')).mockImplementationOnce(() => {
      controller.abort()
      return Promise.reject(new DOMException('중단됨', 'AbortError'))
    })
    await expect(call({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(sdk.chat).toHaveBeenCalledTimes(2)
  })
})

describe('혼자 정한 자동 복구 시간 제한의 부분 본문 보존', () => {
  it('이어 쓰기 중 제한 시간이 끝나면 앞서 작성한 본문을 남긴다', async () => {
    // 왜: SDK가 시간 제한을 일반 중단 오류로 전달해도 서버는 앞서 작성한 본문을 보여줄 수 있어야 한다.
    const controller = new AbortController()
    sdk.chat.mockResolvedValueOnce(text('이미 작성한 본문.', 'max_tokens')).mockImplementationOnce(() => {
      controller.abort(new DOMException('시간 제한', 'TimeoutError'))
      return Promise.reject(new DOMException('요청 중단', 'AbortError'))
    })
    await expect(call({ signal: controller.signal })).rejects.toMatchObject({ reason: 'request_failed', partialText: '이미 작성한 본문.' })
    expect(sdk.chat).toHaveBeenCalledTimes(2)
  })

  it('복구 안내 도중 제한 시간이 끝나면 다음 호출 없이 본문을 남긴다', async () => {
    // 왜: 추가 호출 직전 시간 제한에 걸려도 이미 작성한 내용을 버리면 안 된다.
    const controller = new AbortController()
    sdk.chat.mockResolvedValueOnce(text('이미 작성한 본문.', 'max_tokens'))
    const onRecovery = () => { controller.abort(new DOMException('시간 제한', 'TimeoutError')) }
    await expect(call({ signal: controller.signal, recovery: { ...recovery, onRecovery } })).rejects.toMatchObject({ reason: 'request_failed', partialText: '이미 작성한 본문.' })
    expect(sdk.chat).toHaveBeenCalledTimes(1)
  })

  it('후속 호출의 사용량 기록 중 제한 시간이 끝나면 완료하지 않고 이전 본문을 남긴다', async () => {
    // 왜: 시간 제한 이후 도구 요청을 전달해서는 안 되며 이전 단계의 읽을 수 있는 내용은 보존한다.
    const controller = new AbortController()
    const appTools = prepareChatTools('producer', true, [])!
    sdk.chat.mockResolvedValueOnce(text('이미 작성한 본문.', 'max_tokens')).mockResolvedValueOnce(response([
      { type: 'tool_use', id: 'late', name: 'edit_project', input: {} },
    ], 'tool_use'))
    const onUsage = vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => {
      controller.abort(new DOMException('시간 제한', 'TimeoutError'))
    })
    await expect(call({ appTools, signal: controller.signal, onUsage })).rejects.toMatchObject({ reason: 'request_failed', partialText: '이미 작성한 본문.' })
    expect(appTools.turn).toBeUndefined()
    expect(sdk.chat).toHaveBeenCalledTimes(2)
  })
})
