// 새 샷 참조를 승인까지 보존하고, 승인 전에 달라진 영상 조건으로 실행하지 않는다
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'
const mocks = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn().mockResolvedValue({ balance: null, mode: 'off' }), refetchTakeBalance: vi.fn() }))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(), runVideoBatch: mocks.run }))
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
const originalGenerate = director.getState().generateStoryboardImage
function shot(id: string, provider = 'seedance'): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: id, writerShotId: `writer-${id}`, derivedPrompt: 'base prompt', promptOverride: null, camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider, durationSeconds: 3, storyboardImage: null, referenceImages: [], imageInputs: [] } } as unknown as DirectorNode
}
beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'director', reachedStage: 'director', projectId: 'p-director' })
  director.setState({ projectId: 'p-director', nodes: [], edges: [], selectedNodeId: null, videoBatchBusy: false, generateStoryboardImage: originalGenerate })
  mocks.run.mockResolvedValue({ total: 2, started: 2, failed: 0 })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: '생성을 제안합니다.', updates: [{ type: 'generateVideos' }] })))
})
afterEach(() => { director.setState({ generateStoryboardImage: originalGenerate }); vi.unstubAllGlobals() })
it('새 샷 추가와 이미지 생성을 함께 요청하면 승인한 새 샷에 실행한다', async () => {
  // 왜: 즉시 추가에서 사용한 임시 ID를 승인 실행까지 넘기지 않아 요청이 사라졌다.
  const generate = vi.fn().mockResolvedValue(null)
  director.setState({ generateStoryboardImage: generate })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: '새 샷을 만듭니다.', updates: [{ type: 'addScene', label: '씬', tempId: 'S1' }, { type: 'addShot', sceneId: 'S1', label: '샷', tempId: 'H1' }, { type: 'generateImage', id: 'H1' }] })))
  await chat.getState().sendMessage('새 씬과 샷을 추가하고 새 샷 이미지를 만들어줘')
  const added = director.getState().nodes.find(n => n.data.kind === 'shot')
  expect(added).toBeDefined()
  expect(generate).not.toHaveBeenCalled()
  await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
  expect(generate).toHaveBeenCalledWith(added!.id, expect.any(Object))
})
it('승인 전에 영상 대상이나 모델이 바뀌면 달라진 조건으로 생성하지 않는다', async () => {
  // 왜: 두 샷을 승인했는데 승인 전 화면 변경으로 다른 한 샷이 발주될 수 있었다.
  director.setState({ nodes: [shot('a'), shot('b')] })
  await chat.getState().sendMessage('모든 샷 영상을 만들어줘')
  expect(chat.getState().pendingProposal?.payload.total).toBe(2)
  director.setState({ nodes: [shot('c', 'happy-horse')] })
  await expect(chat.getState().approvePendingProposal()).resolves.toBe(false)
  expect(mocks.run).not.toHaveBeenCalled()
  expect(chat.getState().error).toBeTruthy()
})
it('승인한 영상 조건이 그대로면 기존 일괄 실행 경로로 이어진다', async () => {
  // 왜: 정상 경로 고정 — 변경 감지가 정상 승인도 막으면 안 된다.
  director.setState({ nodes: [shot('a'), shot('b')] })
  await chat.getState().sendMessage('모든 샷 영상을 만들어줘')
  await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
  expect(mocks.run).toHaveBeenCalledWith('p-director', expect.objectContaining({ limit: 2 }))
})
