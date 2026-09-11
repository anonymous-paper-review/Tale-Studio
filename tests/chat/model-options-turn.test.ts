// 한 번 시작한 채팅 요청은 도구를 여러 번 사용해도 처음 선택한 모델 설정을 유지한다
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useProducerStore as producer } from '@/stores/producer-store'
import { useChatUiStore as ui } from '@/stores/chat-ui-store'
import { DEFAULT_CHAT_MODEL_SETTINGS } from '@/lib/chat-model-settings'
beforeEach(() => {
  chat.getState().reset(); project.getState().resetProject(); producer.getState().reset()
  project.setState({ projectId: 'settings-turn', currentStage: 'producer', reachedStage: 'producer' })
  ui.getState().setModelSettings({ model: 'claude-opus-4-6', effort: 'medium', thinking: 'adaptive' })
})
afterEach(() => { vi.unstubAllGlobals(); ui.getState().setModelSettings(DEFAULT_CHAT_MODEL_SETTINGS) })
it('씬 승인 대기에서 상태를 질문해도 승인 카드를 없애지 않는다', async () => {
  // 왜: 상황을 이해하려고 질문한 것이 승인이나 수정 요청을 취소한 것은 아니다.
  project.setState({ currentStage: 'writer', reachedStage: 'writer' })
  chat.setState({ suggestion: { id: 'scene-gate', stage: 'writer', content: '씬을 확인해 주세요', action: { kind: 'confirmScenes', label: '확정' } } })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: '씬 승인 대기 상태입니다.' })))
  await chat.getState().sendMessage('현재 작업 진행 상태를 알려줘')
  expect(chat.getState().suggestion?.id).toBe('scene-gate')
})
it('도구 결과를 기다리는 사이에 선택값이 바뀌어도 진행 중인 요청의 설정은 유지한다', async () => {
  // 왜: 한 응답의 중간에 모델과 사고 설정이 바뀌면 도구 문맥이 끊길 수 있다.
  const sent: Array<Record<string, unknown>> = []
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)))
    if (sent.length === 1) {
      ui.getState().setModelSettings(DEFAULT_CHAT_MODEL_SETTINGS)
      return Response.json({ toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'read', name: 'read_project', input: { resource: 'settings' } }] } })
    }
    return Response.json({ reply: '설정을 확인했어요.' })
  }))
  await chat.getState().sendMessage('현재 설정을 알려줘')
  expect(sent).toHaveLength(2)
  for (const body of sent) expect(body.modelSettings).toEqual({ model: 'claude-opus-4-6', effort: 'medium', thinking: 'adaptive' })
})

it('도구 응답을 받은 뒤 중단해도 이미 발생한 모델 사용량과 설정을 남긴다', async () => {
  // 왜: Stop은 이미 발생한 과금을 0으로 만들지 않으며 실험 합계에서 빠지면 안 된다.
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (++calls === 1) return Response.json({ toolUsage: { model: 'claude-opus-4-6', effort: 'medium', thinking: 'adaptive', inputTokens: 120, outputTokens: 30, durationMs: 700, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }, toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'r', name: 'read_project', input: { resource: 'settings' } }] } })
    chat.getState().stopGeneration()
    throw new DOMException('Stopped', 'AbortError')
  }))
  await chat.getState().sendMessage('현재 설정을 확인해줘')
  expect(chat.getState().lastTrace).toMatchObject({ model: 'claude-opus-4-6', effort: 'medium', thinking: 'adaptive', stopReason: 'aborted', requestUsage: { modelCalls: 1, inputTokens: 120, outputTokens: 30 } })
})
