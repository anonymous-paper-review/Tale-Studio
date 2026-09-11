// 실제 제출 불가능한 샷이 있으면 영상 승인 제안을 보류한다.
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

it('실제 제출 불가능한 샷이 있으면 영상 승인 제안을 보류한다', async () => {
  // 왜: 채팅에서 추가한 샷은 Writer 연결이 없어 실제 영상을 제출할 수 없는데 승인 성공으로 표시됐다.
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    reply: '새 샷을 추가하고 영상을 제안합니다.',
    updates: [
      { type: 'addScene', label: '새 씬', tempId: 'S1' },
      { type: 'addShot', sceneId: 'S1', label: '새 샷', tempId: 'H1' },
      { type: 'generateVideos' },
    ],
  })))

  await chat.getState().sendMessage('새 씬과 샷을 추가하고 영상을 만들어줘')

  expect(director.getState().nodes.filter(node => node.data.kind === 'shot')).toHaveLength(1)
  expect(chat.getState().pendingProposal).toBeNull()
  await expect(chat.getState().approvePendingProposal()).resolves.toBe(false)
  expect(mocks.run).not.toHaveBeenCalled()
})
