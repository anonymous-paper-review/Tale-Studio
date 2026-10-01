// 실제 채팅 요청에서 복구 상태와 사용량을 보존하고 미완성 내용을 설정으로 적용하지 않는다
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useProducerStore as producer } from '@/stores/producer-store'
import { useLocaleStore } from '@/stores/locale-store'
import * as toolLoop from '@/lib/chat-tools/loop'

const usage = (outputTokens: number) => ({ model: 'claude-sonnet-5-5', inputTokens: 100, outputTokens, durationMs: 700, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, stopReason: 'max_tokens' })
const encode = (event: unknown) => new TextEncoder().encode(JSON.stringify(event) + '\n')
beforeEach(() => {
  chat.getState().reset(); project.getState().resetProject(); producer.getState().reset()
  project.setState({ projectId: 'recovery-turn', currentStage: 'producer', reachedStage: 'producer' })
  useLocaleStore.setState({ locale: 'ko' })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('복구 중이면 진행 상태를 표시하고 완료되면 모든 호출 사용량을 합산한다', async () => {
  // 왜: 화면에 대기만 남거나 실패한 첫 호출 비용이 사라지면 복구 상태를 알 수 없다.
  let finish: (() => void) | undefined
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(stream) {
    stream.enqueue(encode({ type: 'usage', usage: usage(64000) }))
    stream.enqueue(encode({ type: 'recovery', attempt: 1, mode: 'continue' }))
    finish = () => {
      stream.enqueue(encode({ type: 'usage', usage: { ...usage(300), stopReason: 'end_turn' } }))
      stream.enqueue(encode({ type: 'result', status: 200, body: { reply: '이어서 완성했어요.' } }))
      stream.close()
    }
  } }), { headers: { 'content-type': 'application/x-ndjson' } })))
  const pending = chat.getState().sendMessage('이야기의 긴 설명을 해줘')
  await vi.waitFor(() => expect(chat.getState().recoveryProgress).toBe('continue'))
  finish!()
  await pending
  expect(chat.getState().recoveryProgress).toBeNull()
  expect(chat.getState().loading).toBe(false)
  expect(chat.getState().messages.at(-1)?.content).toContain('이어서 완성했어요.')
  expect(chat.getState().lastTrace?.requestUsage).toMatchObject({ modelCalls: 2, outputTokens: 64300 })
})

it('자동 복구도 실패하면 미완성 설명을 남기고 설정 변경은 적용하지 않는다', async () => {
  // 왜: 오류 뒤 부분 답변이 유실되거나 성공 응답으로 파싱돼 보드가 바뀌면 안 된다.
  const before = producer.getState().projectSettings.dialogueLanguage
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    error: 'Chat response reached its output limit after automatic recovery.',
    partialReply: '첫 번째 인물의 동기는', extractedSettings: { dialogueLanguage: 'ja' },
    modelUsages: [usage(64000), usage(128000), usage(128000)],
  }, { status: 500 })))
  await chat.getState().sendMessage('이야기를 설명해줘')
  expect(chat.getState().messages.at(-1)?.content).toContain('첫 번째 인물의 동기는')
  expect(chat.getState().messages.at(-1)?.content).toContain('미완성')
  expect(producer.getState().projectSettings.dialogueLanguage).toBe(before)
  expect(chat.getState().lastTrace?.requestUsage?.modelCalls).toBe(3)
})

it('승인 대기 결과와 복구 실패가 함께 있으면 실행 결과 뒤에 미완성 답변을 보존한다', async () => {
  // 왜: 완료 주장을 거르는 처리가 읽을 수 있는 미완성 설명까지 지워서는 안 된다.
  vi.spyOn(toolLoop, 'runChatToolLoop').mockResolvedValue({
    data: { reply: '미완성 답변: 인물의 동기는', partialReply: '미완성 답변: 인물의 동기는' },
    results: [{ call: { type: 'tool_use', id: 'pending', name: 'edit_project', input: { resource: 'settings', id: 'settings', patch: { genre: 'drama' } } }, result: { status: 'approval_required' } }],
    stopped: 'model_error',
  })
  await chat.getState().sendMessage('현재 설정을 알려줘')
  expect(chat.getState().messages.at(-1)?.content).toContain('미완성 답변: 인물의 동기는')
  expect(chat.getState().messages.at(-1)?.content).toContain('승인')
})
