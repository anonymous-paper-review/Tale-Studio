// Director 에서 Lumi 에게 말로 부탁하면 확인 카드 없이 바로 실행하고(이미지 · 영상), 말하지 않은 샷에는 Take 를 쓰지 않으며, 글은 전 · 후를 보고 적용해야 바뀌는지 검사한다 (오너 2026-11-14 9번)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { DirectorNode } from '@/types/director'

const mocks = vi.hoisted(() => ({ run: vi.fn(), balance: { balance: 40 as number | null, mode: 'enforce' as 'enforce' | 'shadow' | 'off' } }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn(async () => mocks.balance), refetchTakeBalance: vi.fn() }))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(), runVideoBatch: mocks.run }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'

const originalGenerate = director.getState().generateStoryboardImage
const IMG = (id: string) => ({ status: 'completed', url: `https://media.test/${id}.png`, jobId: null })
function shot(id: string, image: unknown = null, provider = 'seedance'): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, derivedPrompt: `base prompt ${id}`, promptOverride: null, camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider, durationSeconds: 3, storyboardImage: image, referenceImages: [], imageInputs: [] } } as unknown as DirectorNode
}
function failedTake(id: string, parent: string): DirectorNode {
  return { id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: parent, status: 'failed', lastAttemptStatus: 'failed', videoUrl: null, final: false, takeNumber: 1, override: {} } } as unknown as DirectorNode
}
// 보드: 씬 하나에 샷 넷 — 샷 1 · 2 · 4 는 이미지가 있고, 샷 4 는 영상이 실패했다. 샷 3 은 이미지가 없다.
const NODES = () => [shot('s1', IMG('s1')), shot('s2', IMG('s2')), shot('s3'), shot('s4', IMG('s4')), failedTake('v4', 's4')]
const reply = (updates: unknown[], text = 'Okay.') => vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: text, updates })))
const lastModel = () => chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''
const saidAll = () => chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content).join('\n')
const runShots = () => (mocks.run.mock.calls[0]?.[1] as { shotIds?: string[] } | undefined)?.shotIds

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'director', reachedStage: 'director', projectId: 'p-dir', projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ['s1', 's2', 's3', 's4'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
  director.setState({ projectId: 'p-dir', nodes: NODES(), edges: [], selectedNodeId: null, videoBatchBusy: false, realBatchBusy: false, generateStoryboardImage: originalGenerate })
  mocks.balance = { balance: 40, mode: 'enforce' }
  mocks.run.mockResolvedValue({ total: 2, started: 2, failed: 0 })
})
afterEach(() => {
  director.setState({ generateStoryboardImage: originalGenerate })
  vi.unstubAllGlobals()
})

describe('말로 부탁하면 바로 실행(오너 9번)', () => {
  // 왜: 오너 9번 "루미에게 부탁하면 바로 실행해줘" — 예전엔 그림도 확인 카드를 눌러야 시작했다. 그림은 Take 를 쓰지 않는다(시안 D5).
  it('채팅으로 그림을 만들어 달라고 하면 확인 카드 없이 그 샷 그림을 바로 만들기 시작하고, 몇 장인지 · Takes 안 씀 · 진행은 카드에서를 답한다', async () => {
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ generateStoryboardImage: generate })
    reply([{ type: 'generateImage', id: 's3' }], 'Making it now.')
    await chat.getState().sendMessage('Make the image for shot 3')
    expect(generate).toHaveBeenCalledWith('s3', expect.any(Object))
    expect(chat.getState().pendingProposal).toBeNull()
    expect(lastModel()).toBe('Started making live-action images for Shot 3 · No Takes used. Progress shows on the line above the cards.')
  })

  // 왜: 오너 9번 — Take 를 쓰는 영상도 확인 카드 없이 바로. 대신 무엇을 몇 Take 로 시작했는지 답에 되짚는다(혼자 정한 것 B).
  it('채팅으로 샷 몇 개의 영상을 만들어 달라고 하면 확인 카드 없이 그 샷만 바로 만들기 시작하고, 쓰는 Take 를 답한다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s1', 's2'] }])
    await chat.getState().sendMessage('Make videos for shot 1 and 2')
    expect(mocks.run).toHaveBeenCalledWith('p-dir', expect.objectContaining({ shotIds: ['s1', 's2'] }))
    expect(chat.getState().pendingProposal).toBeNull()
    expect(lastModel()).toBe('Started making videos for Shots 1 · 2 · 10 Takes. Progress shows on the line above the cards.')
  })

  // 왜: 확인 카드가 없으니 말을 잘못 읽어 엉뚱한 샷에 Take 를 쓰면 되돌릴 수 없다 — 영상은 사용자가 말한 샷(번호 · 묶음)에서만 만든다(혼자 정한 것 A).
  it('영상을 부탁한 말에 없는 샷에는 Take 를 쓰지 않고, 어느 샷인지 번호로 말해 달라고 묻는다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s1', 's2'] }])
    await chat.getState().sendMessage('Make a video for shot 1')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Which shots should get videos? Tell me the shot numbers. Videos use Takes, so I only make the shots you name.')
    // 샷 하나를 말했는데 모델이 "남은 샷 전부"로 읽어도 만들지 않는다.
    reply([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('Make a video for shot 2')
    expect(mocks.run).not.toHaveBeenCalled()
  })

  // 왜: 묶음 말(남은 전부 · 실패한 · 이미지 나온 · 고른)은 그 묶음 안의 샷만 만든다 — 시안 D5 칩 "이미지 나온 샷 영상 만들어 줘" · "실패한 샷 다시 만들어 줘".
  it('묶음으로 말하면(남은 전부 · 실패한 · 이미지 나온 · 고른) 그 묶음 안의 샷 영상만 만든다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s1', 's2', 's4'] }])
    await chat.getState().sendMessage('Make videos for the shots whose images are ready')
    expect(runShots()).toEqual(['s1', 's2', 's4'])

    mocks.run.mockClear()
    reply([{ type: 'generateVideos', shotIds: ['s4', 's3'] }])
    await chat.getState().sendMessage('Remake the failed shots')
    expect(mocks.run).not.toHaveBeenCalled()

    mocks.run.mockClear()
    reply([{ type: 'generateVideos', shotIds: ['s4'] }])
    await chat.getState().sendMessage('Remake the failed shots')
    expect(runShots()).toEqual(['s4'])

    mocks.run.mockClear()
    director.setState({ selectedNodeId: 's2' })
    reply([{ type: 'generateVideos', shotIds: ['s2'] }])
    await chat.getState().sendMessage('Make a video for the selected shot')
    expect(runShots()).toEqual(['s2'])

    mocks.run.mockClear()
    reply([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('Make videos for all the remaining shots')
    expect(mocks.run).toHaveBeenCalledWith('p-dir', expect.objectContaining({ shotIds: ['s1', 's2', 's3', 's4'] }))
  })

  // 왜: 오너 9번 "Take 가 모자라면 지금 알림 그대로" — 확인 카드가 없으니 일부만 만들지 않고 아무것도 시작하지 않는다(혼자 정한 것 C).
  it('Take 가 모자라면 영상을 하나도 시작하지 않고 필요한 Take · 가진 Take 를 채팅에 말한다', async () => {
    mocks.balance = { balance: 5, mode: 'enforce' }
    reply([{ type: 'generateVideos', shotIds: ['s1', 's2'] }])
    await chat.getState().sendMessage('Make videos for shot 1 and 2')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Takes needed: 10. Takes you have: 5. I did not start any videos. Add Takes or ask for fewer shots.')
  })

  // 왜: 오너 9번 "끝난 결과가 글이면 전후 비교 후 변화 채택" — Director 채팅은 글을 바로 바꾸고 되돌릴 수도 없었다(확인 결과).
  it('Lumi 가 샷 프롬프트 · 씬 설명을 바꾸면 바로 바꾸지 않고 전 · 후를 보이며, 적용을 눌러야 바뀌고 버리면 그대로다', async () => {
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'A warmer close-up in the rain' } }])
    await chat.getState().sendMessage('Make shot 1 warmer')
    const prompt = () => (director.getState().nodes.find((n) => n.id === 's1')!.data as { promptOverride: string | null }).promptOverride
    expect(prompt()).toBeNull()
    const card = chat.getState().pendingProposal
    expect(card?.kind).toBe('directorTextEdit')
    expect(card?.impact).toEqual(['Shot 1 prompt · before: base prompt s1', 'Shot 1 prompt · after: A warmer close-up in the rain'])
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(prompt()).toBe('A warmer close-up in the rain')

    reply([{ type: 'updateShot', id: 's2', patch: { prompt: 'Something else' } }])
    await chat.getState().sendMessage('Change shot 2')
    chat.getState().dismissPendingProposal()
    expect((director.getState().nodes.find((n) => n.id === 's2')!.data as { promptOverride: string | null }).promptOverride).toBeNull()
  })

  // 왜(혼자 정한 것): 적용하기 전에 사람이 그 글을 고쳤으면, 옛 글을 기준으로 만든 수정안으로 덮지 않는다.
  it('적용하기 전에 그 글이 바뀌었으면 적용하지 않고 다시 부탁해 달라고 한다', async () => {
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'Lumi prompt' } }])
    await chat.getState().sendMessage('Rewrite shot 1')
    director.getState().updateNodeData('s1', { promptOverride: 'My own edit' } as never)
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(false)
    expect((director.getState().nodes.find((n) => n.id === 's1')!.data as { promptOverride: string | null }).promptOverride).toBe('My own edit')
    expect(saidAll()).toContain('The text changed since Lumi suggested this. Please ask again.')
  })

  // 왜(혼자 정한 것 D): 카메라 · 조명 · 모델 같은 설정은 화면에 바로 보이는 값이라 지금처럼 바로 바꾼다 — 전후 비교는 글만.
  it('카메라 · 조명 · 모델 같은 설정은 지금처럼 바로 바뀐다', async () => {
    reply([{ type: 'setLighting', id: 's1', lighting: { position: 'left' } }, { type: 'updateShot', id: 's1', patch: { provider: 'kling-o3' } }])
    await chat.getState().sendMessage('Light shot 1 from the left and use Kling')
    const data = director.getState().nodes.find((n) => n.id === 's1')!.data as { lighting: { position: string }; provider: string }
    expect(data.lighting.position).toBe('left')
    expect(data.provider).toBe('kling-o3')
    expect(chat.getState().pendingProposal).toBeNull()
  })

  // 왜: 서버 지시문도 같은 약속을 말해야 모델이 "확인 카드가 뜰 거예요"라고 하지 않는다.
  it('서버 지시문은 그림 · 영상을 바로 만든다고 알리고, 영상은 사용자가 말한 샷만 담게 한다', () => {
    const route = readFileSync(path.join(process.cwd(), 'src/app/api/director/chat/route.ts'), 'utf8')
    expect(route).toContain('It runs at once and uses no Takes.')
    expect(route).toContain('Put in "shotIds" exactly the shots the user named')
    expect(route).not.toContain('approval card')
  })
})
