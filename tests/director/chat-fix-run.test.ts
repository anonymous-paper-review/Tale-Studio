// 채팅에서 샷 그림 · 영상 고치기를 부탁하면 Lumi 가 담은 바꿀 점이 바로 만들기 · [적용] 뒤 만들기 · "응" 뒤 만들기 모두에 실려 그림 · 영상 만들기까지 간다 (오너 2026-11-26 O5 · O8)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'

const mocks = vi.hoisted(() => ({ run: vi.fn(), balance: { balance: 40 as number | null, mode: 'enforce' as 'enforce' | 'shadow' | 'off', failed: false } }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn(async () => mocks.balance), refetchTakeBalance: vi.fn() }))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(), runVideoBatch: mocks.run }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { takeCostForVideo } from '@/lib/billing/take-cost'

const originalGenerate = director.getState().generateStoryboardImage
const originalRemake = director.getState().remakeShotVideo
const originalVideo = director.getState().generateVideoForShot
const IMG = (id: string) => ({ status: 'completed', url: `https://media.test/${id}.png`, jobId: null })
function shot(id: string): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, derivedPrompt: `base prompt ${id}`, promptOverride: null, camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider: 'seedance', durationSeconds: 3, storyboardImage: IMG(id), referenceImages: [], imageInputs: [] } } as unknown as DirectorNode
}
function doneTake(id: string, parent: string, takeNumber = 1, override: Record<string, unknown> = {}): DirectorNode {
  return { id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: parent, status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://media.test/${id}.mp4`, final: false, takeNumber, override } } as unknown as DirectorNode
}
// 보드: 샷 1 · 2 는 그림이 있고, 샷 2 는 영상(Take 1)도 있다.
const NODES = () => [shot('s1'), shot('s2'), doneTake('v2', 's2')]
const reply = (updates: unknown[], text = 'Okay.') => vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: text, updates })))
const lastModel = () => chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''
const saidAll = () => chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content).join('\n')
const acceptingRemake = () =>
  vi.fn(async (id: string, opts?: { onAccepted?: (jobId: string) => void }) => {
    opts?.onAccepted?.(`job-${id}`)
    return `job-${id}`
  })

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'director', reachedStage: 'director', projectId: 'p-dir', projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ['s1', 's2'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
  director.setState({ projectId: 'p-dir', nodes: NODES(), edges: [], selectedNodeId: null, videoBatchBusy: false, realBatchBusy: false, generateStoryboardImage: originalGenerate })
  mocks.balance = { balance: 40, mode: 'enforce', failed: false }
})
afterEach(() => {
  director.setState({ generateStoryboardImage: originalGenerate, remakeShotVideo: originalRemake, generateVideoForShot: originalVideo })
  chat.setState({ directorVideoFixIntent: null })
  vi.unstubAllGlobals()
})

describe('그림 고치기', () => {
  it('Lumi 가 샷 그림 만들기에 바꿀 점을 담으면 그 바꿀 점을 실어 그 샷 그림을 바로 다시 만든다', async () => {
    // 왜: 오너 O8 (a) — 바꿀 점이 그림 만들기까지 가야 서버가 지금 그림을 바탕으로 바꿀 점만 고친다.
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ generateStoryboardImage: generate })
    reply([{ type: 'generateImage', id: 's1', change: 'Add raindrops on the window.' }])
    await chat.getState().sendMessage('@Real Shot 1 Fix the image and make it again: add raindrops on the window')
    expect(generate).toHaveBeenCalledWith('s1', expect.objectContaining({ changeNote: 'Add raindrops on the window.' }))
  })

  it('같은 답에 샷 글 고침이 같이 와 [적용]을 기다린 그림도 [적용] 뒤 바꿀 점을 실어 만든다', async () => {
    // 왜: 글 카드에 묶였다 풀린 그림이 바꿀 점을 잃으면 고치기가 아니라 처음부터 다시 그리기가 된다.
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ generateStoryboardImage: generate })
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'A rainy night street.' } }, { type: 'generateImage', id: 's1', change: 'Make it night.' }])
    await chat.getState().sendMessage('Make shot 1 a rainy night and fix its image: make it night')
    expect(generate).not.toHaveBeenCalled()
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(generate).toHaveBeenCalledWith('s1', expect.objectContaining({ changeNote: 'Make it night.' }))
  })
})

describe('영상 고치기', () => {
  it('Lumi 가 영상 다시 만들기에 바꿀 점을 담으면 "응" 뒤 그 바꿀 점을 실어 그 샷의 새 Take 를 만든다', async () => {
    // 왜: 오너 O8 (e)(f) — 바꿀 점이 새 Take 요청에 따로 실려야 샷 글이 그대로라 작가의 움직임 글이 남고, 바꿀 점이 상한에 잘리지 않는다.
    const remake = acceptingRemake()
    director.setState({ remakeShotVideo: remake })
    reply([{ type: 'generateVideos', shotIds: ['s2'], change: 'Make her walk more slowly.' }])
    await chat.getState().sendMessage('@Real Shot 2 Fix the video and remake it as a new Take: make her walk more slowly')
    expect(lastModel()).toMatch(/Say yes to start\.$/)
    await chat.getState().sendMessage('yes')
    expect(remake).toHaveBeenCalledWith('s2', expect.objectContaining({ changeNote: 'Make her walk more slowly.' }))
  })

  it('같은 답에 샷 글 고침이 같이 와 [적용]을 기다린 영상 다시 만들기도 [적용] 뒤 바꿀 점을 실어 만든다', async () => {
    // 왜: 글 카드에 묶였다 풀린 새 Take 가 바꿀 점을 잃으면 같은 영상을 다시 만들 뿐이다.
    const remake = acceptingRemake()
    director.setState({ remakeShotVideo: remake })
    reply([{ type: 'updateShot', id: 's2', patch: { prompt: 'A slow walk at dusk.' } }, { type: 'generateVideos', shotIds: ['s2'], change: 'Make her walk more slowly.' }])
    await chat.getState().sendMessage('@Real Shot 2 Fix the video and remake it as a new Take: make her walk more slowly')
    expect(remake).not.toHaveBeenCalled()
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    await vi.waitFor(() => expect(remake).toHaveBeenCalledWith('s2', expect.objectContaining({ changeNote: 'Make her walk more slowly.' })))
  })

  it('바꿀 점이 없는 영상 다시 만들기는 지금처럼 바꿀 점 없이 만든다', async () => {
    // 왜: 정상 경로 고정 — "다시 만들어 줘"는 고치기가 아니다(가장 최근 Take 설정을 이어받기만 한다).
    const remake = acceptingRemake()
    director.setState({ remakeShotVideo: remake })
    reply([{ type: 'generateVideos', shotIds: ['s2'] }])
    await chat.getState().sendMessage('Remake the video for shot 2')
    if (/Say yes to start\.$/.test(lastModel())) await chat.getState().sendMessage('yes')
    expect(remake).toHaveBeenCalledTimes(1)
    expect(remake.mock.calls[0]![1]).not.toHaveProperty('changeNote')
  })
})

describe('팝업에서 고른 영상 설정', () => {
  // 샷 2 의 Take 1(Seedance 720p · 보던 Take)과 Take 2(Kling 720p · 가장 최근).
  const WITH_TWO_TAKES = () => [shot('s1'), shot('s2'), doneTake('v2a', 's2', 1), doneTake('v2b', 's2', 2, { provider: 'kling-o3', resolution: '720p' })]
  const INTENT = { projectId: 'p-dir', shotNodeId: 's2', fromTakeId: 'v2a', provider: 'h3-max', resolution: '1080p' } as const

  it('팝업에서 고른 모델 · 해상도와 보던 Take 가 Lumi 답 · "응" 뒤 새 Take 요청까지 그대로 가고, Take 수도 그 모델 · 해상도로 센다', async () => {
    // 왜(검토 rev-director 2번): H3 Max 1080p 를 고르고 [Lumi…] → "응"을 했는데 가장 최근 Take 의 Seedance 720p 로 5 Take 가 나갔다 — Take 가 걸린 고장.
    director.setState({ nodes: WITH_TWO_TAKES() })
    const remake = acceptingRemake()
    director.setState({ remakeShotVideo: remake })
    chat.setState({ directorVideoFixIntent: INTENT })
    reply([{ type: 'generateVideos', shotIds: ['s2'], change: 'Make her walk more slowly.' }])
    await chat.getState().sendMessage('@Real Shot 2 Fix the video and remake it as a new Take: make her walk more slowly')
    const takes = takeCostForVideo('h3-max', '1080p')
    expect(lastModel()).toContain(takes === 1 ? '(1 Take)' : `(${takes} Takes)`)
    await chat.getState().sendMessage('yes')
    expect(remake).toHaveBeenCalledWith('s2', expect.objectContaining({ changeNote: 'Make her walk more slowly.', fromTakeId: 'v2a', videoOverride: { provider: 'h3-max', resolution: '1080p' } }))
  })

  it('맡긴 영상 설정은 그 부탁 한 번에만 쓴다 — 다음에 그냥 "다시 만들어 줘"면 지금처럼 가장 최근 Take 설정으로 만든다', async () => {
    // 왜: 팝업에서 고른 값이 남아 나중의 다른 부탁까지 바꾸면 사람이 고른 적 없는 모델로 Take 를 쓴다.
    director.setState({ nodes: WITH_TWO_TAKES() })
    const remake = acceptingRemake()
    director.setState({ remakeShotVideo: remake })
    chat.setState({ directorVideoFixIntent: INTENT })
    reply([{ type: 'generateVideos', shotIds: ['s2'], change: 'Slower.' }])
    await chat.getState().sendMessage('@Real Shot 2 Fix the video and remake it as a new Take: slower')
    await chat.getState().sendMessage('no')
    expect(chat.getState().directorVideoFixIntent).toBeNull()
    reply([{ type: 'generateVideos', shotIds: ['s2'] }])
    await chat.getState().sendMessage('Remake the video for shot 2')
    if (/Say yes to start\.$/.test(lastModel())) await chat.getState().sendMessage('yes')
    expect(remake).toHaveBeenCalledTimes(1)
    expect(remake.mock.calls[0]![1]).not.toHaveProperty('fromTakeId')
    expect(remake.mock.calls[0]![1]).not.toHaveProperty('videoOverride')
  })

  it('다시 만들기가 보던 Take · 고른 모델 · 해상도를 받으면 그 Take 를 이어받고 그 모델 · 해상도와 바꿀 점으로 새 Take 를 만든다', async () => {
    // 왜: 채팅 길의 끝(remakeShotVideo)이 받은 값을 버리면 앞의 배선이 소용없다 — 샷 상세의 [새 Take] 단추와 같은 요청이 나가야 한다.
    director.setState({ nodes: WITH_TWO_TAKES(), remakeShotVideo: originalRemake })
    const generate = vi.fn().mockResolvedValue('new-take')
    director.setState({ generateVideoForShot: generate })
    await director.getState().remakeShotVideo('s2', { changeNote: 'Slower.', fromTakeId: 'v2a', videoOverride: { provider: 'h3-max', resolution: '1080p' } })
    expect(generate).toHaveBeenCalledWith('s2', expect.objectContaining({ inheritFromVideoNodeId: 'v2a', videoOverride: { provider: 'h3-max', resolution: '1080p', changeNote: 'Slower.' } }))
    director.setState({ generateVideoForShot: originalVideo })
  })
})

describe('그리는 중 · 일괄 중인 샷의 그림 고치기', () => {
  const drawing = (id: string) => ({ ...shot(id), data: { ...shot(id).data, storyboardImage: { status: 'generating', url: '', jobId: 'job-x' } } }) as unknown as DirectorNode

  it('그리는 중인 샷의 그림 고치기 부탁은 보내지 않고 지금 만드는 중이라고 답한다 — "만들기 시작"이라고 하지 않는다', async () => {
    // 왜(검토 rev-director 3번): 스토어가 같은 샷의 진행 중 작업을 조용히 버려(deduped) 바꿀 점이 사라졌는데 Lumi 는 "만들기 시작"이라고 했다.
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ nodes: [drawing('s1'), shot('s2')], generateStoryboardImage: generate })
    reply([{ type: 'generateImage', id: 's1', change: 'Add rain.' }])
    await chat.getState().sendMessage('@Real Shot 1 Fix the image and make it again: add rain')
    expect(generate).not.toHaveBeenCalled()
    expect(saidAll()).toContain('The image for Shot 1 is being made right now. Ask again when it is done.')
    expect(saidAll()).not.toContain('Started making live-action images')
  })

  it('실사 일괄 중에는 그림 고치기 부탁을 보내지 않고 일괄이 끝난 뒤 다시 하라고 답한다', async () => {
    // 왜: 일괄 중에는 스토어가 낱장 요청을 막는다(같은 샷이 시트와 낱장에서 동시에 그려지지 않게) — 막힌 것을 "시작"이라고 말하면 안 된다.
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ realBatchBusy: true, generateStoryboardImage: generate })
    reply([{ type: 'generateImage', id: 's1', change: 'Add rain.' }])
    await chat.getState().sendMessage('@Real Shot 1 Fix the image and make it again: add rain')
    expect(generate).not.toHaveBeenCalled()
    expect(saidAll()).toContain('Batch live-action generation is running. Try again after it finishes.')
    expect(saidAll()).not.toContain('Started making live-action images')
  })

  it('[적용]을 기다린 그림도 그사이 그리기가 시작됐으면 보내지 않고 그렇다고 말한다', async () => {
    // 왜: 글 카드에 묶인 그림은 [적용] 때 만든다 — 그때 이미 그리는 중이면 같은 고장(조용히 버림)이 난다.
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ generateStoryboardImage: generate })
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'A rainy night street.' } }, { type: 'generateImage', id: 's1', change: 'Make it night.' }])
    await chat.getState().sendMessage('Make shot 1 a rainy night and fix its image: make it night')
    director.setState({ nodes: [drawing('s1'), shot('s2'), doneTake('v2', 's2')] })
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(generate).not.toHaveBeenCalled()
    expect(saidAll()).toContain('The image for Shot 1 is being made right now. Ask again when it is done.')
  })
})
