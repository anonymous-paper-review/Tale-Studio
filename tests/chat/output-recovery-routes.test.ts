// 세 단계 채팅은 자동 복구와 중단을 연결하고 복구에 사용한 모든 호출의 사용량을 전달한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatLlmUsage } from '@/lib/chat-trace'
import { ChatOutputRecoveryError, type ChatOutputRecoveryOptions } from '@/lib/chat-output-recovery'

const mocks = vi.hoisted(() => ({ chat: vi.fn(), getUser: vi.fn(), ownsProject: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.ownsProject }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.chat }))
vi.mock('@/lib/chat-format', () => ({
  CHAT_OUTPUT_FORMAT_GUIDE: '', CHAT_UPDATES_BATCH_GUIDE: '',
  resolveChatLocale: vi.fn(), responseLanguageDirective: () => '',
}))
vi.mock('@/lib/style-anchor', () => ({ listStyleAnchorCatalog: async () => [], listStyleAnchorMediums: async () => [] }))
vi.mock('@/lib/reference-import', () => ({ getProjectReferenceId: async () => null, buildReferenceDigest: async () => '' }))
vi.mock('@/lib/artist/chat-context', () => ({ buildArtistActivityContext: async () => '' }))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import * as producer from '@/app/api/produce/chat/route'
import * as writer from '@/app/api/writer/chat/route'
import * as artist from '@/app/api/artist/chat/route'

type ChatOptions = {
  signal: AbortSignal
  recovery?: ChatOutputRecoveryOptions
  onUsage: (usage: ChatLlmUsage) => void
}

const firstUsage: ChatLlmUsage = {
  model: 'claude-sonnet-5-5', durationMs: 500, inputTokens: 100, outputTokens: 64000,
  cacheReadInputTokens: 0, cacheCreationInputTokens: 0, stopReason: 'max_tokens',
}
const finalUsage: ChatLlmUsage = { ...firstUsage, durationMs: 800, outputTokens: 700, stopReason: 'end_turn' }

function request(body: Record<string, unknown> = { message: '답변을 완성해줘' }, signal?: AbortSignal, streaming = false) {
  return new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(streaming ? { Accept: 'application/x-ndjson' } : {}) },
    body: JSON.stringify(body), signal,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.chat.mockReset().mockResolvedValue('완성된 답변입니다.')
  mocks.getUser.mockResolvedValue({ id: 'owner', user_metadata: { locale: 'ko' } })
  mocks.ownsProject.mockResolvedValue(false)
})

describe.each([['Producer', producer], ['Writer', writer], ['Artist', artist]] as const)('%s 출력 복구 연결', (_name, route) => {
  it('채팅을 요청하면 자동 복구와 중단을 연결해 완성된 답변을 전달한다', async () => {
    // 왜: 화면의 복구 기능이 실제 채팅 호출에 연결되지 않는 경우를 막는다.
    const response = await route.POST(request())
    const options = mocks.chat.mock.calls[0][5] as ChatOptions
    expect(options.recovery).toBeDefined()
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ reply: '완성된 답변입니다.' })
    expect(route).toHaveProperty('maxDuration', 300)
  })

  it('복구로 모델을 여러 번 호출하면 잘린 응답과 완성된 응답의 사용량을 모두 전달한다', async () => {
    // 왜: 마지막 호출만 기록하면 자동 복구가 사용한 출력 비용이 화면에서 사라진다.
    mocks.chat.mockImplementation(async (...args: unknown[]) => {
      const options = args[5] as ChatOptions
      options.onUsage(firstUsage)
      options.onUsage(finalUsage)
      return '완성된 답변입니다.'
    })
    const response = await route.POST(request())
    expect(await response.json()).toMatchObject({
      reply: '완성된 답변입니다.', modelUsages: [firstUsage, finalUsage],
    })
  })

  it('사용자가 중단하면 복구 중인 모델 호출도 중단한다', async () => {
    // 왜: 브라우저 요청의 중단이 복구용 모델 호출까지 전달되어야 한다.
    const controller = new AbortController()
    let modelSignal: AbortSignal | undefined
    mocks.chat.mockImplementation(async (...args: unknown[]) => {
      modelSignal = (args[5] as ChatOptions).signal
      controller.abort()
      expect(modelSignal.aborted).toBe(true)
      throw new DOMException('중단됨', 'AbortError')
    })
    await route.POST(request({ message: '답변을 완성해줘' }, controller.signal))
    expect(modelSignal?.aborted).toBe(true)
    expect(mocks.chat).toHaveBeenCalledTimes(1)
  })

  it('복구 중이면 진행 상태를 먼저 보내고 완성된 답변의 변경 사항만 전달한다', async () => {
    // 왜: 긴 복구를 기다리는 화면에 진행 상태를 알리고 미완성 변경은 실행에 넘기지 않아야 한다.
    let finish: (() => void) | undefined
    const pending = new Promise<void>(resolve => { finish = resolve })
    const changes = _name === 'Producer'
      ? { extractedSettings: { styleAnchorKey: 'real' } }
      : _name === 'Writer'
        ? { updates: [{ type: 'addScene', narrativeSummary: '서로를 발견한다.' }] }
        : { updates: [{ type: 'createCharacter', name: '민수' }] }
    mocks.chat.mockImplementation(async (...args: unknown[]) => {
      const options = args[5] as ChatOptions
      options.onUsage(firstUsage)
      await options.recovery?.onRecovery?.({ attempt: 1, mode: 'continue' })
      await pending
      options.onUsage(finalUsage)
      return `완성된 답변입니다.\n\n\`\`\`json\n${JSON.stringify(changes)}\n\`\`\``
    })
    const response = await route.POST(request(undefined, undefined, true))
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    const first = await reader.read()
    let text = decoder.decode(first.value, { stream: true })
    expect(text).not.toContain('"type":"result"')
    finish!()
    while (true) {
      const next = await reader.read()
      if (next.done) break
      text += decoder.decode(next.value, { stream: true })
    }
    text += decoder.decode()
    const events = text.trim().split('\n').map(line => JSON.parse(line))
    expect(events.map(event => event.type)).toEqual(['usage', 'recovery', 'usage', 'result'])
    expect(events[1]).toEqual({ type: 'recovery', attempt: 1, mode: 'continue' })
    expect(events[3]).toMatchObject({ type: 'result', status: 200, body: { reply: '완성된 답변입니다.', ...changes } })
  })

  it.each([false, true])('복구를 마치지 못하면 부분 답변을 남기고 변경 사항은 전달하지 않는다 (%s)', async (streaming) => {
    // 왜: 복구 한도 이후의 잘린 설정이나 작업 지시가 성공한 변경으로 처리되면 안 된다.
    const partialReply = '여기까지 작성했습니다.'
    mocks.chat.mockImplementation(async (...args: unknown[]) => {
      const options = args[5] as ChatOptions
      options.onUsage(firstUsage)
      throw new ChatOutputRecoveryError(partialReply, 'output_limit')
    })
    const response = await route.POST(request(undefined, undefined, streaming))
    const result = streaming
      ? (await response.text()).trim().split('\n').map(line => JSON.parse(line)).find(event => event.type === 'result')
      : { status: response.status, body: await response.json() }
    expect(result).toMatchObject({ status: 500, body: { partialReply, recoveryStopped: 'output_limit' } })
    for (const field of ['reply', 'updates', 'extractedSettings', 'toolTurn', 'proposals', 'appearanceCreations']) {
      expect(result.body).not.toHaveProperty(field)
    }
  })

  it.each([false, true])('로그인하지 않은 요청이면 복구 여부와 관계없이 인증 오류를 유지한다 (%s)', async (streaming) => {
    // 왜: 복구를 위한 응답 방식이 기존 접근 제한을 성공 응답으로 바꾸면 안 된다.
    mocks.getUser.mockResolvedValue(null)
    const response = await route.POST(request({ message: '안녕' }, undefined, streaming))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.chat).not.toHaveBeenCalled()
  })

  it.each([false, true])('메시지가 없는 요청이면 복구 여부와 관계없이 입력 오류를 유지한다 (%s)', async (streaming) => {
    // 왜: 입력 검증에 실패한 요청은 모델을 호출하지 않고 원래 오류를 반환해야 한다.
    const response = await route.POST(request({}, undefined, streaming))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid request: message is required' })
    expect(mocks.chat).not.toHaveBeenCalled()
  })

  it.each([false, true])('소유하지 않은 프로젝트의 도구 요청이면 복구 여부와 관계없이 접근 오류를 유지한다 (%s)', async (streaming) => {
    // 왜: 자동 복구 응답으로 바뀌어도 다른 프로젝트에 접근하는 요청은 차단해야 한다.
    const response = await route.POST(request({ message: '설정을 바꿔줘', projectId: 'foreign', chatTools: true }, undefined, streaming))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
    expect(mocks.chat).not.toHaveBeenCalled()
  })
})
