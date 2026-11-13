// 실제 제출 불가능한 샷이 있으면 채팅 영상 만들기를 시작하지 않고 그 이유를 알리는지 검사한다 (오너 2026-11-14 9번 — 확인 카드 없이 바로 실행)
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({
  saveChatMessage: vi.fn(),
  saveChatTrace: vi.fn(),
  saveChatTracePatch: vi.fn(),
  loadLatestChatTrace: vi.fn(),
}))
vi.mock('@/lib/billing/use-take-balance', () => ({
  fetchTakeBalance: vi.fn().mockResolvedValue({ balance: null, mode: 'off' }),
  refetchTakeBalance: vi.fn(),
}))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(),
  runVideoBatch: mocks.run,
}))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'director', reachedStage: 'director', projectId: 'p-preflight' })
  director.setState({
    projectId: 'p-preflight',
    nodes: [],
    edges: [],
    selectedNodeId: null,
    videoBatchBusy: false,
  })
})

afterEach(() => vi.unstubAllGlobals())

it('실제 제출 불가능한 샷이 있으면 채팅 영상 만들기를 시작하지 않고 그 이유를 알린다', async () => {
  // 왜: 채팅에서 추가한 샷은 Writer 연결이 없어 실제 영상을 제출할 수 없는데 성공으로 표시됐다. 확인 카드 없이 바로 실행하므로 시작 전에 막고 까닭을 말한다.
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    reply: '새 샷을 추가하고 영상을 제안합니다.',
    updates: [
      { type: 'addScene', label: '새 씬', tempId: 'S1' },
      { type: 'addShot', sceneId: 'S1', label: '새 샷', tempId: 'H1' },
      { type: 'generateVideos' },
    ],
  })))

  // 말에 "씬"(범위 말)이 있으면 모델이 샷 칸을 비웠을 때 번호부터 묻는다(재재검토 b 낮음 1) — 이 시험은 제출할 수 없는 샷의 까닭을 보므로 범위 말 없이 부탁한다.
  await chat.getState().sendMessage('새 샷을 추가하고 남은 샷 영상을 전부 만들어줘')

  expect(director.getState().nodes.filter(node => node.data.kind === 'shot')).toHaveLength(1)
  expect(chat.getState().pendingProposal).toBeNull()
  expect(mocks.run).not.toHaveBeenCalled()
  expect(chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content).toMatch(/Writer/)
})
