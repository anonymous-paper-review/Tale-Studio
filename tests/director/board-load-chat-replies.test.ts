// 샷 정보를 다 읽기 전 · 못 불러옴일 때 채팅 답(AI 답 · 되묻기의 "응" · 글 카드 [적용] 뒤 · 알림 카드 단추)으로 오는 그림 · 영상 만들기도 시작하지 않고 "아직 다 불러오지 못했어요"라고 답하는지, 막힌 글 카드는 그대로 남는지 검사한다 (리드 2026-11-23 판 읽기 뒷마무리 3)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'

const mocks = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn(async () => ({ balance: 40, mode: 'enforce', failed: false })), refetchTakeBalance: vi.fn() }))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(), runVideoBatch: mocks.run }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { markBoardLoad, useBoardLoadStore } from '@/stores/board-load-store'

const originalGenerate = director.getState().generateStoryboardImage
const originalRemake = director.getState().remakeShotVideo
const IMG = (id: string) => ({ status: 'completed', url: `https://media.test/${id}.png`, jobId: null })
function shot(id: string, image: unknown = null): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, derivedPrompt: `base prompt ${id}`, promptOverride: null, camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider: 'seedance', durationSeconds: 3, storyboardImage: image, referenceImages: [], imageInputs: [] } } as unknown as DirectorNode
}
function failedTake(id: string, parent: string): DirectorNode {
  return { id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: parent, status: 'failed', lastAttemptStatus: 'failed', videoUrl: null, final: false, takeNumber: 1, override: {} } } as unknown as DirectorNode
}
// 이 브라우저에 남은 옛 판 — 샷 1 · 2 · 4 는 이미지가 있고 샷 4 영상은 실패, 샷 3 은 이미지가 없다.
const NODES = () => [shot('s1', IMG('s1')), shot('s2', IMG('s2')), shot('s3'), shot('s4', IMG('s4')), failedTake('v4', 's4')]
const NODES_ALL_IMAGES = () => NODES().map((node) => (node.id === 's3' ? shot('s3', IMG('s3')) : node))
const LINE = "The shots haven't finished loading yet. Please ask again once they're loaded."
// 채팅 AI 는 부르지 않는다 — 서버 답을 흉내만 낸다.
const reply = (updates: unknown[], text = 'Okay.') => vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: text, updates })))
const models = () => chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
const lastModel = () => models().at(-1) ?? ''
const promptOf = (id: string) => (director.getState().nodes.find((n) => n.id === id)!.data as { promptOverride: string | null }).promptOverride
const generate = vi.fn().mockResolvedValue(null)
const remake = vi.fn().mockResolvedValue(null)
async function startsBatch(_projectId: string, opts?: { shotIds?: readonly string[] }) {
  director.getState().beginVideoBatch(opts?.shotIds?.length ?? 0)
  director.setState({ videoBatchBusy: false })
  return { total: opts?.shotIds?.length ?? 0, started: opts?.shotIds?.length ?? 0, failed: 0 }
}
const nothingStarted = () => {
  expect(generate).not.toHaveBeenCalled()
  expect(remake).not.toHaveBeenCalled()
  expect(mocks.run).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'director', reachedStage: 'director', projectId: 'p-dir', projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ['s1', 's2', 's3', 's4'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
  director.setState({ projectId: 'p-dir', nodes: NODES(), edges: [], selectedNodeId: null, videoBatchBusy: false, realBatchBusy: false, generateStoryboardImage: generate, remakeShotVideo: remake })
  useBoardLoadStore.setState({ projectId: null, status: 'loading', retry: null })
  mocks.run.mockImplementation(startsBatch)
})
afterEach(() => {
  director.setState({ generateStoryboardImage: originalGenerate, remakeShotVideo: originalRemake })
  vi.unstubAllGlobals()
})

describe('판 읽기 뒷마무리 3 — 같이 정한 것(리드 11/23)', () => {
  it('다 읽기 전 · 못 불러옴일 때 채팅 답(AI 답 · 되묻기의 "응" · 글 카드 [적용] 뒤 · 알림 카드 단추)으로 오는 그림 · 영상 만들기도 시작하지 않고 "샷을 아직 다 불러오지 못했어요. 불러온 뒤 다시 말해 주세요."로 답한다', async () => {
    // 왜: 위쪽 단추 · 빠른 칩을 막아도 채팅 답으로는 읽지 못한 판의 셈으로 만들기가 시작될 수 있었다(리드 11/23, 자리 셋 — 영상 시작 · 그림 넘김 · 글 카드 뒤 일).
    for (const status of ['loading', 'failed'] as const) {
      markBoardLoad('p-dir', status)
      // AI 답의 그림
      reply([{ type: 'generateImage', id: 's3' }], 'Making it now.')
      await chat.getState().sendMessage('Make the image for shot 3')
      expect(lastModel(), `${status} 그림`).toBe(LINE)
      // AI 답의 영상
      reply([{ type: 'generateVideos', shotIds: ['s1'] }])
      await chat.getState().sendMessage('Make a video for shot 1')
      expect(lastModel(), `${status} 영상`).toBe(LINE)
    }
    nothingStarted()
    // 되묻기의 "응" — 되묻는 것까지는 하고, "응"에서 시작하지 않는다.
    markBoardLoad('p-dir', 'failed')
    director.setState({ nodes: NODES_ALL_IMAGES() })
    reply([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('샷 2 빼고 영상 다 만들어줘')
    expect(lastModel()).toBe('Shall I make 3 videos for Shots 1 · 3 · 4 (15 Takes)? Say yes to start.')
    await chat.getState().sendMessage('응')
    expect(lastModel()).toBe(LINE)
    // 알림 카드 단추
    await chat.getState().startDirectorVideos(['s4'], 'Make Shot 4 again', { remake: true })
    expect(lastModel()).toBe(LINE)
    // 글 카드 [적용] 뒤의 그림 · 영상
    director.setState({ nodes: NODES() })
    reply([{ type: 'updateShot', id: 's3', patch: { prompt: 'Rain' } }, { type: 'generateImage', id: 's3' }, { type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } }, { type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make shot 3 rainy and draw it. Make shot 1 warm and make its video')
    expect(chat.getState().pendingProposal).not.toBeNull()
    await chat.getState().approvePendingProposal()
    expect(lastModel()).toBe(LINE)
    nothingStarted()
  })

  it('다 읽기 전 · 못 불러옴일 때 그림 · 영상이 묶인 글 카드의 [적용]이 막히면 카드는 그대로 남아 다 읽은 뒤 다시 누를 수 있다', async () => {
    // 왜: 막혔다고 카드를 지우면 같은 부탁을 처음부터 다시 해야 한다(리드 11/23 "막혔다고 카드를 지우지 않아요").
    markBoardLoad('p-dir', 'loading')
    reply([{ type: 'updateShot', id: 's3', patch: { prompt: 'Rain' } }, { type: 'generateImage', id: 's3' }])
    await chat.getState().sendMessage('Make shot 3 rainy and draw it')
    const card = chat.getState().pendingProposal
    expect(card).not.toBeNull()
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(false)
    expect(chat.getState().pendingProposal?.id).toBe(card!.id)
    expect(generate).not.toHaveBeenCalled()
    // 다 읽은 뒤 다시 누르면 글을 바꾸고 그 글로 그림을 만든다.
    markBoardLoad('p-dir', 'ready')
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(promptOf('s3')).toBe('Rain')
    expect(generate).toHaveBeenCalledWith('s3', expect.any(Object))
  })

  it('판 읽기 기록이 없거나 다 읽은 판이면 채팅 답의 그림 · 영상 만들기는 지금처럼 시작한다', async () => {
    // 왜: 정상 경로 고정 — 판을 읽지 않는 화면(Editor 등)과 다 읽은 판은 지금 그대로(리드 11/23 "기록이 없으면 지금처럼").
    reply([{ type: 'generateImage', id: 's3' }])
    await chat.getState().sendMessage('Make the image for shot 3')
    expect(generate).toHaveBeenCalledWith('s3', expect.any(Object))
    markBoardLoad('p-dir', 'ready')
    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make a video for shot 1')
    expect(mocks.run).toHaveBeenCalledWith('p-dir', expect.objectContaining({ shotIds: ['s1'] }))
    expect(models()).not.toContain(LINE)
  })
})

describe('판 읽기 뒷마무리 3 — 혼자 정한 것(되돌리기 쉬움)', () => {
  it('막힌 글 카드 [적용]은 글도 바꾸지 않는다 — 다시 누를 때 옛 글 검사에 걸리지 않게', async () => {
    // 왜: 글만 바꾸고 카드를 남기면 다시 누를 때 "그새 글이 바뀌었다"로 걸려 그림 · 영상을 다시 부탁해야 한다.
    markBoardLoad('p-dir', 'failed')
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } }, { type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make shot 1 warm and make its video')
    await chat.getState().approvePendingProposal()
    expect(promptOf('s1')).toBeNull()
    expect(models()).not.toContain('Applied the text.')
  })

  it('한 답에서 그림 · 영상 만들기가 함께 막혀도 까닭 줄은 한 번만 남긴다', async () => {
    // 왜: 같은 줄이 두 번 나오면 고장으로 보인다.
    markBoardLoad('p-dir', 'loading')
    reply([{ type: 'generateImage', id: 's3' }, { type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Draw shot 3 and make a video for shot 1')
    expect(models().filter((line) => line === LINE)).toHaveLength(1)
    nothingStarted()
  })

  it('그림 · 영상이 묶이지 않은 글만의 카드는 다 읽기 전에도 지금처럼 [적용]된다', async () => {
    // 왜: 막이는 만들기만 — 글 고침은 만들기가 아니다(지금 그대로).
    markBoardLoad('p-dir', 'loading')
    reply([{ type: 'updateShot', id: 's2', patch: { prompt: 'Cold' } }])
    await chat.getState().sendMessage('Make shot 2 cold')
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(promptOf('s2')).toBe('Cold')
  })
})
