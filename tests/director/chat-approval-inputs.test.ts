// 채팅이 새 샷을 만들며 그 그림을 부탁하면 그 새 샷에 바로 실행하고, 채팅 영상은 부탁한 그때의 샷으로 버튼과 같은 길에 바로 이어지는지 검사한다 (오너 2026-11-14 9번 — 확인 카드 없음)
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
// 샷은 이미지가 있다 — 이미지 없는 샷은 영상을 보내지 않으므로(서버도 missing_storyboard 로 건너뜀, 리드 11/14 B1) 영상 길을 보는 시험은 이미지가 있는 보드로 본다.
function shot(id: string, provider = 'seedance'): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: id, writerShotId: `writer-${id}`, derivedPrompt: 'base prompt', promptOverride: null, camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider, durationSeconds: 3, storyboardImage: { status: 'completed', url: `https://media.test/${id}.png`, jobId: null }, referenceImages: [], imageInputs: [] } } as unknown as DirectorNode
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
it('새 샷 추가와 이미지 생성을 함께 요청하면 그 새 샷의 이미지를 바로 만든다', async () => {
  // 왜: 같은 답에서 만든 새 샷의 임시 이름(H1)이 실제 샷으로 이어져야 한다 — 예전엔 승인까지 넘기지 않아 요청이 사라졌다. 이제는 확인 없이 바로(오너 9번).
  const generate = vi.fn().mockResolvedValue(null)
  director.setState({ generateStoryboardImage: generate })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: '새 샷을 만듭니다.', updates: [{ type: 'addScene', label: '씬', tempId: 'S1' }, { type: 'addShot', sceneId: 'S1', label: '샷', tempId: 'H1' }, { type: 'generateImage', id: 'H1' }] })))
  await chat.getState().sendMessage('새 씬과 샷을 추가하고 새 샷 이미지를 만들어줘')
  const added = director.getState().nodes.find(n => n.data.kind === 'shot')
  expect(added).toBeDefined()
  expect(generate).toHaveBeenCalledWith(added!.id, expect.any(Object))
  expect(chat.getState().pendingProposal).toBeNull()
})
it('채팅으로 영상을 부탁하면 부탁한 그때의 샷으로 바로 만든다', async () => {
  // 왜: 확인 카드가 없으니 부탁을 받은 그때의 샷 목록으로 바로 시작한다 — 뒤에 화면이 바뀌어도 다른 샷이 발주되지 않는다.
  director.setState({ nodes: [shot('a'), shot('b')] })
  await chat.getState().sendMessage('모든 샷 영상을 만들어줘')
  expect(mocks.run).toHaveBeenCalledTimes(1)
  expect(mocks.run).toHaveBeenCalledWith('p-director', expect.objectContaining({ shotIds: ['a', 'b'] }))
  director.setState({ nodes: [shot('c', 'happy-horse')] })
  expect(mocks.run).toHaveBeenCalledTimes(1)
})
it('채팅 영상 만들기는 버튼과 같은 일괄 실행 길(runVideoBatch)로 바로 이어진다', async () => {
  // 왜: 정상 경로 고정 — 채팅도 버튼과 같은 러너를 써야 진행 줄 · 이어 보내기 · Take 처리가 같다.
  director.setState({ nodes: [shot('a'), shot('b')] })
  await chat.getState().sendMessage('모든 샷 영상을 만들어줘')
  expect(chat.getState().pendingProposal).toBeNull()
  const [pid, opts] = mocks.run.mock.calls[0] as [string, { onJob?: unknown }]
  expect(pid).toBe('p-director')
  expect(typeof opts.onJob).toBe('function')
})
