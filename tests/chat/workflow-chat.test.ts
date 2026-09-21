// 채팅의 상태 조회와 복합 수정 요청은 공통 도구 경로를 사용한다
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ workflow: vi.fn(), execute: vi.fn() }))
vi.mock('@/stores/chat-workflow-bindings', () => ({ createStudioWorkflow: () => mocks.workflow, workflowPermission: () => true }))
vi.mock('@/stores/chat-tool-bindings', () => ({ createStudioToolResources: () => ({}) }))
vi.mock('@/lib/chat-tools/executor', async original => ({ ...await original<object>(), createChatToolExecutor: () => mocks.execute }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
beforeEach(() => {
  chat.getState().reset(); project.getState().resetProject()
  project.setState({ projectId: 'workflow-chat', currentStage: 'writer', reachedStage: 'artist' })
  mocks.workflow.mockReset().mockResolvedValue({ status: 'ok', state: { writer: { status: 'completed' } } })
  mocks.execute.mockReset().mockResolvedValue({ status: 'ok' })
})
afterEach(() => vi.unstubAllGlobals())
it('모델이 고른 상태 조회 도구의 실제 결과를 다음 모델 호출로 돌려준다', async () => {
  // 왜: 도구 목록만 추가하고 실행기로 연결하지 않는 가짜 toolcall을 막는다.
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body); bodies.push(body)
    return Response.json(bodies.length === 1 ? { toolTurn: { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 's', name: 'project_workflow', input: { action: 'status' } }] } } : { reply: 'Writer 작업은 완료 상태예요.' })
  }))
  await chat.getState().sendMessage('지금 어느 단계이고 왜 막혔는지 확인해줘')
  expect(mocks.workflow).toHaveBeenCalledOnce()
  expect(mocks.execute).not.toHaveBeenCalled()
  expect(bodies[0].chatWorkflow).toBe(true)
  expect(JSON.stringify(bodies[1].toolMessages)).toContain('completed')
})
it('샷을 수정하고 Artist로 이동하라는 요청을 이동만 하는 빠른 경로가 삼키지 않는다', async () => {
  // 왜: 문장 끝의 이동 의도를 먼저 처리하면 앞의 수정이 영구히 빠진다.
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url, init) => { requests.push(String(url));return Response.json({ reply: '수정할 샷을 확인하고 있어요.', updates: [], modelSettings: JSON.parse(init?.body ?? '{}').modelSettings }) }))
  await chat.getState().sendMessage('첫 번째 샷을 9초로 바꿔주고 Artist로 넘겨줘')
  expect(requests).toContain('/api/writer/chat')
  expect(chat.getState().pendingNavigatePath).toBeNull()
})
