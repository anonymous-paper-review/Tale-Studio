// Director 에서 Lumi 에게 말로 부탁하면 확인 카드 없이 바로 실행하고(이미지 · 영상), 말하지 않은 샷에는 Take 를 쓰지 않으며, 글은 전 · 후를 보고 적용해야 바뀌고
//   그 글이 걸린 샷의 생성은 [적용]을 기다리는지 검사한다 (오너 2026-11-14 9번 · 검토 b)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { DirectorNode } from '@/types/director'

const mocks = vi.hoisted(() => ({ run: vi.fn(), balance: { balance: 40 as number | null, mode: 'enforce' as 'enforce' | 'shadow' | 'off', failed: false }, refusal: vi.fn((): { shotNodeId: string } | null => null) }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn(async () => mocks.balance), refetchTakeBalance: vi.fn() }))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(), runVideoBatch: mocks.run }))
// 내 영상 동시 한도(429) 거절 — 다시 만들기가 그 샷이 한도에 걸렸는지 읽는 값만 바꾼다(나머지 상점은 그대로).
vi.mock('@/stores/director-store', async (importOriginal) => ({ ...await importOriginal<typeof import('@/stores/director-store')>(), videoLimitRefusal: () => mocks.refusal() }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { translate } from '@/lib/i18n/translate'
import { fetchTakeBalance } from '@/lib/billing/use-take-balance'
import { remakeNotice } from '@/lib/director/editor-handover'
import { DIRECTOR_QUICK_CHIPS } from '@/lib/constants'

const originalGenerate = director.getState().generateStoryboardImage
const originalVideo = director.getState().generateVideoForShot
const originalRemake = director.getState().remakeShotVideo
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
const promptOf = (id: string) => (director.getState().nodes.find((n) => n.id === id)!.data as { promptOverride: string | null }).promptOverride
/** 다시 만들기 가짜 — 서버가 2xx 로 받은 것처럼 접수 알림(onAccepted)을 바로 부르고 끝난다(진짜 상점의 접수 알림과 같은 뜻). */
const acceptingRemake = (onCall?: (id: string) => void) =>
  vi.fn(async (id: string, opts?: { onAccepted?: (jobId: string) => void }) => {
    onCall?.(id)
    opts?.onAccepted?.(`job-${id}`)
    return `job-${id}`
  })
/** 러너처럼 — 시작하면 그 자리에서 새 묶음 표시를 단다(끝난 것으로 바로 풀어 다음 부탁을 막지 않는다). */
async function startsBatch(_projectId: string, opts?: { shotIds?: readonly string[] }) {
  director.getState().beginVideoBatch(opts?.shotIds?.length ?? 0)
  director.setState({ videoBatchBusy: false })
  return { total: opts?.shotIds?.length ?? 0, started: opts?.shotIds?.length ?? 0, failed: 0 }
}

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'director', reachedStage: 'director', projectId: 'p-dir', projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ['s1', 's2', 's3', 's4'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
  director.setState({ projectId: 'p-dir', nodes: NODES(), edges: [], selectedNodeId: null, videoBatchBusy: false, realBatchBusy: false, generateStoryboardImage: originalGenerate })
  mocks.balance = { balance: 40, mode: 'enforce', failed: false }
  mocks.run.mockImplementation(startsBatch)
})
afterEach(() => {
  director.setState({ generateStoryboardImage: originalGenerate, generateVideoForShot: originalVideo, remakeShotVideo: originalRemake })
  mocks.refusal.mockReset()
  mocks.refusal.mockReturnValue(null)
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
  it('영상을 바로 시작하면 답에 대상 샷과 쓰는 Take 를 되짚는다 — "샷 1·2 영상을 만들기 시작했어요 · 10 Take"', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s1', 's2'] }])
    await chat.getState().sendMessage('Make videos for shot 1 and 2')
    expect(mocks.run).toHaveBeenCalledWith('p-dir', expect.objectContaining({ shotIds: ['s1', 's2'] }))
    expect(chat.getState().pendingProposal).toBeNull()
    expect(lastModel()).toBe('Started making videos for Shots 1 · 2 · 10 Takes. Progress shows on the line above the cards.')
  })

  // 왜: 확인 카드가 없으니 말을 잘못 읽어 엉뚱한 샷에 Take 를 쓰면 되돌릴 수 없다 — 아주 분명한 꼴만 바로 하고 그 밖은 목록으로 되묻는다(혼자 정한 것 A · 재검토 b 보통 A).
  it('Take 를 쓰는 부탁은 아주 분명한 두 꼴(샷 번호만 · 생성 말과 붙은 묶음 말만)일 때만 바로 하고, 모델이 더 담은 샷은 더하지 않는다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s1', 's2'] }])
    await chat.getState().sendMessage('Make a video for shot 1')
    expect(runShots()).toEqual(['s1'])
    mocks.run.mockClear()
    reply([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('Make a video for shot 2')
    expect(runShots()).toEqual(['s2'])
  })

  // 왜: 재검토 b 보통 A — 빼기 · 부정 · 범위 말이 끼면 읽기 규칙을 늘려도 틀린다. 만들지 않고 화면이 센 목록으로 묻고, "응"일 때만 그 목록 그대로.
  it('"샷 2 빼고 영상 다 만들어줘"는 바로 만들지 않고 샷 2 를 뺀 목록으로 되묻고, "응"이라고 하면 그 목록 그대로 만든다', async () => {
    reply([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('샷 2 빼고 영상 다 만들어줘')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Shall I make 3 videos for Shots 1 · 3 · 4 (15 Takes)? Say yes to start.')
    expect(translate('ko', 'Shall I make {count} videos for {shots} ({takes} Takes)? Say yes to start.', { count: 3, shots: '샷 1·3·4', takes: 15 }))
      .toBe('샷 1·3·4 영상 3개(15 Take)를 만들까요? "응"이라고 하면 시작해요.')
    await chat.getState().sendMessage('응')
    expect(runShots()).toEqual(['s1', 's3', 's4'])
    expect(lastModel()).toBe('Started making videos for Shots 1 · 3 · 4 · 15 Takes. Progress shows on the line above the cards.')
  })

  // 왜: 되묻기는 "응"일 때만 만든다 — 아니라고 하거나 다른 말을 하거나 다른 단계에서 답하면 그 목록은 버린다.
  it('되물은 영상 목록은 같은 단계에서 "응 · 좋아 · yes"라고 할 때만 만들고, 아니라고 하거나 다른 말 · 다른 단계면 만들지 않는다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('영상 하나만 만들어줘')
    await chat.getState().sendMessage('아니')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('I did not make any videos.')

    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('영상 하나만 만들어줘')
    reply([])
    await chat.getState().sendMessage('Make shot 1 warmer')
    await chat.getState().sendMessage('yes')
    expect(mocks.run).not.toHaveBeenCalled()

    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('영상 하나만 만들어줘')
    project.setState({ currentStage: 'editor' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ reply: 'advice' })))
    await chat.getState().sendMessage('좋아')
    project.setState({ currentStage: 'director' })
    await chat.getState().sendMessage('좋아')
    expect(mocks.run).not.toHaveBeenCalled()
  })

  // 왜: 묶음 말(남은 전부 · 실패한 · 이미지 나온 · 고른)만 있으면 그 묶음 안의 샷만 바로 만든다 — 모델이 묶음 밖을 더 담아도 더하지 않는다.
  it('묶음 말(남은 전부 · 실패한 · 이미지 나온 · 고른)만 있으면 그 묶음 안의 샷 영상만 바로 만들고, 모델이 더 담은 샷은 더하지 않는다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s1', 's2', 's4'] }])
    await chat.getState().sendMessage('Make videos for the shots whose images are ready')
    expect(runShots()).toEqual(['s1', 's2', 's4'])

    mocks.run.mockClear()
    // "Remake"는 다시 만들기 — 넘기기 창 · 샷 상세 [다시 만들기]와 같은 다시 만들기 하나로 샷마다 보낸다(리드 낮음 6).
    const remake = acceptingRemake()
    director.setState({ remakeShotVideo: remake })
    reply([{ type: 'generateVideos', shotIds: ['s4', 's3'] }])
    await chat.getState().sendMessage('Remake the failed shot videos')
    expect(remake.mock.calls.map(([id]) => id)).toEqual(['s4'])

    remake.mockClear()
    reply([{ type: 'generateVideos', shotIds: ['s4'] }])
    await chat.getState().sendMessage('Remake the failed shot videos')
    expect(remake.mock.calls.map(([id]) => id)).toEqual(['s4'])
    expect(mocks.run).not.toHaveBeenCalled()

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
  it('쓰는 Take 가 가진 Take 보다 많으면 일부만 만들지 않고 하나도 시작하지 않으며, 필요한 Take · 가진 Take 를 채팅에 말한다', async () => {
    mocks.balance = { balance: 5, mode: 'enforce', failed: false }
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

  // 왜: 검토 b 보통 1 — 글 고침과 영상을 한 답에 부탁하면 영상이 옛 글로 바로 시작돼 Take 가 나갔다. 그 샷의 생성은 글 카드 [적용]에 묶는다.
  it('글 고침과 같은 샷의 영상을 한 답에 부탁하면 영상은 바로 시작하지 않고 글 카드에 "적용하면 샷 1 영상을 바로 만들어요 · 5 Take"로 묶인다', async () => {
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'A warmer close-up in the rain' } }, { type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make shot 1 warmer and then make the video for shot 1')
    expect(mocks.run).not.toHaveBeenCalled()
    const card = chat.getState().pendingProposal
    expect(card?.kind).toBe('directorTextEdit')
    expect(card?.impact).toContain('Applying also makes the video for Shot 1 right away · 5 Takes.')
    expect(translate('ko', 'Applying also makes the video for {shots} right away · {takes} Takes.', { shots: '샷 1', takes: 5 })).toBe('적용하면 샷 1 영상을 바로 만들어요 · 5 Take.')
  })

  // 왜: [적용]은 "글을 바꾼 뒤 그 글로 생성", [버리기]는 "둘 다 안 함"(검토 b 보통 1). 그림도 같은 묶음이다.
  it('글 카드의 [적용]을 누르면 글을 바꾼 뒤 그 글로 영상 · 그림을 만들고, [버리기]면 둘 다 하지 않는다', async () => {
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ generateStoryboardImage: generate })
    let promptAtRun: string | null = null
    mocks.run.mockImplementation(async (projectId: string, opts?: { shotIds?: readonly string[] }) => {
      promptAtRun = promptOf('s1')
      return startsBatch(projectId, opts)
    })
    reply([
      { type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } },
      { type: 'generateVideos', shotIds: ['s1'] },
      { type: 'updateShot', id: 's3', patch: { prompt: 'Rain' } },
      { type: 'generateImage', id: 's3' },
    ])
    await chat.getState().sendMessage('Make shot 1 warm and make its video. Make shot 3 rainy and draw it')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
    expect(chat.getState().pendingProposal?.impact).toContain('Applying also makes the live-action image for Shot 3 right away · No Takes used.')
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(promptAtRun).toBe('Warm')
    expect(runShots()).toEqual(['s1'])
    expect(generate).toHaveBeenCalledWith('s3', expect.any(Object))

    mocks.run.mockClear()
    reply([{ type: 'updateShot', id: 's2', patch: { prompt: 'Cold' } }, { type: 'generateVideos', shotIds: ['s2'] }])
    await chat.getState().sendMessage('Make shot 2 cold and make its video')
    chat.getState().dismissPendingProposal()
    expect(mocks.run).not.toHaveBeenCalled()
    expect(promptOf('s2')).toBeNull()
  })

  // 왜: 글이 걸리지 않은 샷까지 글 카드를 기다리게 하면 9번 "바로 실행"이 깨진다 — 그림은 바로, 영상은 말이 시키는 꼴이 아니라 목록으로 묻는다(재재검토 b 보통 C).
  it('글 고침이 걸리지 않은 샷은 글 카드를 기다리지 않는다 — 그림은 바로 만들고, 영상은 "응"이라고 하면 만든다', async () => {
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ generateStoryboardImage: generate })
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } }, { type: 'generateVideos', shotIds: ['s2'] }, { type: 'generateImage', id: 's3' }])
    await chat.getState().sendMessage('Make shot 1 warm, the video for shot 2 and the image for shot 3')
    expect(generate).toHaveBeenCalledWith('s3', expect.any(Object))
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Shall I make the video for Shot 2 (5 Takes)? Say yes to start.')
    await chat.getState().sendMessage('yes')
    expect(runShots()).toEqual(['s2'])
  })

  // 왜: 재재검토 b 보통 D — "네?"는 "응"이 아니라 되묻는 말이다. 목록을 버리지 않고 다시 묻는다.
  it('되물은 목록에 "네?"처럼 되묻는 말로 답하면 시작하지 않고, 목록을 그대로 둔 채 다시 묻는다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('영상 하나만 만들어줘')
    for (const word of ['네?', '응?', 'yes?', '좋아?']) {
      await chat.getState().sendMessage(word)
      expect(mocks.run, word).not.toHaveBeenCalled()
      expect(lastModel()).toBe('Shall I start? Please answer yes or no.')
    }
    expect(translate('ko', 'Shall I start? Please answer yes or no.')).toBe("시작할까요? '응' 또는 '아니'로 답해 주세요.")
    await chat.getState().sendMessage('응')
    expect(runShots()).toEqual(['s1'])
  })

  // 왜: 검토 b 보통 2(c) — "만들지 마"를 모델이 영상 부탁으로 읽어도 만들지 않고, 만들지 않았다고 분명히 말한다.
  it('만들지 말라는 말에 모델이 영상을 담아도 만들지 않고 "영상은 만들지 않았어요"라고 말한다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s2'] }])
    await chat.getState().sendMessage("Don't make a video for shot 2")
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('I did not make any videos.')
    expect(translate('ko', 'I did not make any videos.')).toBe('영상은 만들지 않았어요.')
  })

  // 왜: 검토 b 낮음 4 — 잔액을 못 읽으면 "과금 꺼짐"으로 읽혀 Take 셈이 빠졌다. 못 읽은 것과 정말 꺼진 것을 가른다.
  it('Take 잔액을 확인하지 못하면 영상을 시작하지 않고 "Take 를 확인하지 못해 시작하지 않았어요"라고 말한다', async () => {
    mocks.balance = { balance: null, mode: 'off', failed: true }
    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make the video for shot 1')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe("I couldn't check your Takes, so I didn't start. Please ask again in a moment.")
    expect(translate('ko', "I couldn't check your Takes, so I didn't start. Please ask again in a moment.")).toBe('Take 를 확인하지 못해 시작하지 않았어요. 잠시 뒤 다시 부탁해 주세요.')
  })

  // 왜: 실패를 "꺼짐"과 같은 값으로 돌려주면 위 막이가 설 곳이 없다 — 조회 실패는 실패로 알린다.
  it('Take 잔액 조회가 실패하면 과금 꺼짐과 구별해 실패로 알려 준다', async () => {
    const real = await vi.importActual<typeof import('@/lib/billing/use-take-balance')>('@/lib/billing/use-take-balance')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await real.fetchTakeBalance()).toMatchObject({ failed: true })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ balance: null, mode: 'off' })))
    expect(await real.fetchTakeBalance()).toMatchObject({ mode: 'off', failed: false })
    expect(vi.isMockFunction(fetchTakeBalance)).toBe(true)
  })

  // 왜: 검토 b 낮음 5 — Take 를 세는 사이 다른 묶음(다른 부탁 · 툴바)이 시작되면 러너는 아무것도 안 하는데 "시작했어요"라고 했다.
  it('영상을 시작하기 직전에 다른 영상 묶음이 돌기 시작했으면 시작했다고 말하지 않고 이미 돌고 있다고 말한다', async () => {
    vi.mocked(fetchTakeBalance).mockImplementationOnce(async () => {
      director.setState({ videoBatchBusy: true })
      return { ...mocks.balance, loading: false }
    })
    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make the video for shot 1')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('A video batch is already running. Ask again when it finishes.')
  })

  // 왜: 러너가 시작하지 않은 것(다른 프로젝트로 바뀜 등)을 "시작했어요"라고 말하지 않는다 — 러너는 시작하면 그 자리에서 묶음 표시를 단다.
  it('러너가 영상을 시작하지 않았으면 "시작했어요"라고 말하지 않는다', async () => {
    mocks.run.mockImplementationOnce(async () => ({ total: 0, started: 0, failed: 0 }))
    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make the video for shot 1')
    expect(lastModel()).toBe("I couldn't start the videos. Please ask again in a moment.")
  })

  // 왜: 재검토 b 보통 B — 글 카드가 기다리는 중에 다음 말로 그 샷 영상을 부탁하면 옛 글로 바로 시작됐다. 그 카드의 [적용]에 더해 묶는다.
  it('글 카드가 기다리는 샷의 영상을 다음 말로 부탁하면 옛 글로 바로 만들지 않고 그 카드의 [적용]에 묶는다', async () => {
    let promptAtRun: string | null = null
    mocks.run.mockImplementation(async (projectId: string, opts?: { shotIds?: readonly string[] }) => {
      promptAtRun = promptOf('s1')
      return startsBatch(projectId, opts)
    })
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } }])
    await chat.getState().sendMessage('Make shot 1 warm')
    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make the video for shot 1')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Applying the text card makes the video for Shot 1 with the new text.')
    expect(chat.getState().pendingProposal?.impact).toContain('Applying also makes the video for Shot 1 right away · 5 Takes.')
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(runShots()).toEqual(['s1'])
    expect(promptAtRun).toBe('Warm')
  })

  // 왜: 재검토 b 낮음 3 — 되묻기가 늘었다. Lumi 가 번호를 물은 바로 다음 말은 "3번" · 맨 숫자로 답해도 샷 번호로 읽어야 한다.
  it('Lumi 가 번호를 물은 다음 말에서는 "3번" · "3번이랑 4번" · 맨 숫자도 샷 번호로 읽어 그 샷 영상을 바로 만든다', async () => {
    const ask = async () => {
      reply([{ type: 'generateVideos', shotIds: ['s2'] }])
      await chat.getState().sendMessage('샷 2 빼고 영상 다 만들어줘')
      expect(lastModel()).toBe("Which shots should get videos? Tell me the numbers, like 'shot 3'. Videos use Takes, so I only make the shots you name.")
    }
    await ask()
    await chat.getState().sendMessage('3번')
    expect(runShots()).toEqual(['s3'])
    mocks.run.mockClear()
    await ask()
    await chat.getState().sendMessage('3번이랑 4번')
    expect(runShots()).toEqual(['s3', 's4'])
    mocks.run.mockClear()
    await ask()
    await chat.getState().sendMessage('1')
    expect(runShots()).toEqual(['s1'])
    // 묻지 않았으면 맨 숫자는 샷 번호가 아니다(평소 말로 간다).
    mocks.run.mockClear()
    reply([])
    await chat.getState().sendMessage('2')
    expect(mocks.run).not.toHaveBeenCalled()
  })

  // 왜: 재검토 b 낮음 1 — 묶어 둔 샷 영상이 그사이 다른 길로 만들어지면 [적용] 때 낼 것이 없는데 "시작했어요 · 5 Take"라고 했다.
  it('묶어 둔 샷 영상이 그사이 다른 길로 만들어졌으면 [적용] 때 다시 만들지 않고 "지금 그런 샷이 없어요"라고 한다', async () => {
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } }, { type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make shot 1 warm and make its video')
    director.setState({ nodes: [...director.getState().nodes, { id: 'v1', type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: 'v1', parentShotNodeId: 's1', status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://media.test/v1.mp4', final: false, takeNumber: 1, override: {} } } as unknown as DirectorNode] })
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('There are no such shots right now.')
  })

  // 왜: 재재검토 b 낮음 2 — 다른 카드가 기다려 새 글 카드를 못 내면, 글이 걸린 샷을 되묻기 목록에 담아 "응"으로 옛 글로 시작했다(C4).
  it('새 글 카드를 못 낸 답에서는 글이 걸린 샷을 되묻기 목록에서도 빼고 "글 고침이 아직 적용되지 않아 샷 1 영상은 뺐어요"라고 말한다', async () => {
    reply([{ type: 'updateShot', id: 's2', patch: { prompt: 'Cold' } }])
    await chat.getState().sendMessage('Make shot 2 cold')
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } }, { type: 'generateVideos', shotIds: ['s1'] }])
    await chat.getState().sendMessage('Make shot 1 warm and make its video')
    expect(chat.getState().directorVideoAsk).toBeNull()
    expect(lastModel()).toBe("I left out the video for Shot 1 because its text change isn't applied yet.")
    expect(translate('ko', "I left out the video for {shots} because its text change isn't applied yet.", { shots: '샷 1' })).toBe('글 고침이 아직 적용되지 않아 샷 1 영상은 뺐어요.')
    await chat.getState().sendMessage('응')
    expect(mocks.run).not.toHaveBeenCalled()
  })

  // 왜: 재검토 b 낮음 2 — "2?"는 대답이 아니라 되묻는 말이다(물음표 규칙). 바로 만들지 않고 그 샷 목록으로 되묻는다.
  it('번호를 물은 뒤 "2?"처럼 물음표로 답하면 바로 만들지 않고 "샷 2 영상 1개(5 Take)를 만들까요?"로 되묻는다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s2'] }])
    await chat.getState().sendMessage('샷 2 빼고 영상 다 만들어줘')
    await chat.getState().sendMessage('2?')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Shall I make the video for Shot 2 (5 Takes)? Say yes to start.')
    expect(translate('ko', 'Shall I make the video for {shots} ({takes} Takes)? Say yes to start.', { shots: '샷 2', takes: 5 })).toBe('샷 2 영상 1개(5 Take)를 만들까요? "응"이라고 하면 시작해요.')
    await chat.getState().sendMessage('응')
    expect(runShots()).toEqual(['s2'])
  })

  // 왜: 검토 b efac9881 — 범위 말("씬")에 모델이 샷 칸을 비우면 번호부터 물어, 같은 답에서 더한 새 샷처럼 낼 수 없는 샷이 낀 부탁에 까닭 대신 번호를 물었다.
  it('모델 부탁에 Writer 에 없는 샷(같은 답에서 더한 새 샷)이 끼면 범위 · 수량 말이 있어도 번호를 묻지 않고 그 까닭을 말한다', async () => {
    reply([{ type: 'addScene', label: 'New scene', tempId: 'S9' }, { type: 'addShot', sceneId: 'S9', label: 'New shot', tempId: 'H9' }, { type: 'generateVideos' }])
    await chat.getState().sendMessage('새 씬과 샷을 하나 더하고 영상을 만들어줘')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(chat.getState().directorVideoAsk).toBeNull()
    expect(saidAll()).not.toContain('Which shots should get videos?')
    expect(lastModel()).toBe('Video generation is on hold because a shot is not linked to Writer. Please request videos for shots created in Writer.')
    // 낼 수 없는 샷이 없으면 지금처럼 번호를 묻는다.
    chat.getState().reset()
    director.setState({ nodes: NODES(), edges: [] })
    reply([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('씬 1 영상 만들어줘')
    expect(lastModel()).toBe("Which shots should get videos? Tell me the numbers, like 'shot 3'. Videos use Takes, so I only make the shots you name.")
    expect(chat.getState().directorVideoAsk).toEqual({ projectId: 'p-dir', numbers: true })
  })

  // 왜: 검토 b 재검토 낮음 3(M4) — 칸이 비면 보드 전체를 봐서, 보드에 원래 있던 Director 에서 더한 빈 샷 때문에 "씬 1 영상 다 만들어줘"에 번호 대신 Writer 까닭을 말했다.
  it('모델이 샷 칸을 비운 영상 부탁은 같은 답에서 더한 샷만 보고 까닭을 말하고, 보드에 원래 있던 Writer 에 없는 샷 때문에 번호 대신 엉뚱한 까닭을 말하지 않는다', async () => {
    const manual = { ...shot('m1'), data: { ...shot('m1').data, label: 'New Shot', writerShotId: null } } as unknown as DirectorNode
    director.setState({ nodes: [...NODES(), manual] })
    reply([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('씬 1 영상 다 만들어줘')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe("Which shots should get videos? Tell me the numbers, like 'shot 3'. Videos use Takes, so I only make the shots you name.")
    expect(chat.getState().directorVideoAsk).toEqual({ projectId: 'p-dir', numbers: true })
  })

  // 왜: 검토 b 재검토 보통 1(M1) — 넘기기 창(D8)의 [다시 만들기]는 글 카드를 보지 않고 바로 만들어, [적용]을 기다리는 샷이 옛 글로 Take 를 썼다.
  it('글 카드가 기다리는 샷은 Editor 넘기기 창의 [다시 만들기]로도 옛 글로 만들지 않는다', async () => {
    reply([{ type: 'updateShot', id: 's4', patch: { prompt: 'Warm' } }])
    await chat.getState().sendMessage('Make shot 4 warm')
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
    // 다시 만들기 가짜 — 접수 알림을 보낸다(넘기기 창은 접수로 시작을 센다, 리드 11/14).
    const generate = acceptingRemake()
    director.setState({ remakeShotVideo: generate })
    chat.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'p-dir', via: 'button' } })
    await expect(chat.getState().remakeMissingVideo('s4')).resolves.toEqual({ started: false, reason: 'pending_text_edit' })
    expect(generate).not.toHaveBeenCalled()
    expect(promptOf('s4')).toBeNull()
    // 창은 그 줄 밑에, 채팅은 Lumi 말로 까닭을 알린다(두 말).
    expect(remakeNotice('pending_text_edit', (key) => translate('ko', key))).toBe('[적용]을 기다리는 글 고침이 있어요. 적용하거나 버린 뒤 다시 만들어 주세요.')
    expect(remakeNotice('pending_text_edit', (key) => translate('en', key))).toBe('A text change is waiting for [Apply]. Apply or discard it, then make it again.')
    expect(lastModel()).toBe('Shot 4 has a text change waiting for [Apply]. Apply or discard it, then make it again.')
    expect(translate('ko', '{shots} has a text change waiting for [Apply]. Apply or discard it, then make it again.', { shots: '샷 4' })).toBe('샷 4에는 [적용]을 기다리는 글 고침이 있어요. 적용하거나 버린 뒤 다시 만들어 주세요.')
    // 글이 걸리지 않은 샷은 지금처럼 만든다.
    await expect(chat.getState().remakeMissingVideo('s1')).resolves.toEqual({ started: true })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  // 왜: 리드 낮음 6 — 채팅 "다시 만들어줘"가 일괄 길로 가면 넘기기 창 · 샷 상세 [다시 만들기](가장 최근 Take 의 모델 · 해상도 · 배선을 이어받음)와 다른 설정으로 만들었다.
  it('"샷 4 영상 다시 만들어줘"는 넘기기 창 · 샷 상세와 같은 다시 만들기(그 샷의 가장 최근 Take 설정을 이어받는 새 Take)로 바로 만들고, 되짚는 Take 도 그 설정으로 센다', async () => {
    const remake = acceptingRemake()
    director.setState({ nodes: NODES().map((n) => (n.id === 'v4' ? { ...n, data: { ...n.data, override: { resolution: '1080p' } } } as DirectorNode : n)), remakeShotVideo: remake })
    reply([{ type: 'generateVideos', shotIds: ['s4'] }])
    await chat.getState().sendMessage('샷 4 영상 다시 만들어줘')
    expect(remake.mock.calls.map(([id]) => id)).toEqual(['s4'])
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Started making videos for Shot 4 · 10 Takes. Progress shows on the line above the cards.')
  })

  // 왜: 정상 경로 고정 — "다시"가 없는 부탁은 위쪽 [영상 만들기]와 같은 일괄 길이다(버튼 · 말이 같은 이름이면 같은 길).
  it('"다시"가 없는 "샷 4 영상 만들어줘"는 지금처럼 위쪽 [영상 만들기]와 같은 일괄 길로 만든다', async () => {
    const remake = acceptingRemake()
    director.setState({ remakeShotVideo: remake })
    reply([{ type: 'generateVideos', shotIds: ['s4'] }])
    await chat.getState().sendMessage('샷 4 영상 만들어줘')
    expect(runShots()).toEqual(['s4'])
    expect(remake).not.toHaveBeenCalled()
  })

  // 왜: 리드 낮음 6 — 이미지를 다시 그리는 중에 영상을 다시 만들면 옛 그림이나 그림 없이 만들어져 Take 가 헛쓰인다(넘기기 창 [다시 만들기]와 같다).
  it('다시 만들 샷의 이미지를 만드는 중이면 시작하지 않고 "샷 4 이미지를 만드는 중이에요. 끝나면 영상을 만들 수 있어요"라고 한다', async () => {
    const remake = acceptingRemake()
    director.setState({ nodes: NODES().map((n) => (n.id === 's4' ? { ...n, data: { ...n.data, storyboardImage: { status: 'generating', url: null, jobId: 'j' } } } as DirectorNode : n)), remakeShotVideo: remake })
    reply([{ type: 'generateVideos', shotIds: ['s4'] }])
    await chat.getState().sendMessage('샷 4 영상 다시 만들어줘')
    expect(remake).not.toHaveBeenCalled()
    expect(lastModel()).toBe('The image for Shot 4 is being made. You can make the video once it is done.')
    expect(translate('ko', 'The image for {shots} is being made. You can make the video once it is done.', { shots: '샷 4' })).toBe('샷 4 이미지를 만드는 중이에요. 끝나면 영상을 만들 수 있어요.')
  })

  // 왜(혼자 정한 것): 다시 만들기는 샷마다 따로 보내 내 영상 동시 한도에 걸릴 수 있다 — 시작한 것만 "시작했어요"로 되짚고, 못 한 샷은 까닭과 함께 말한다.
  it('여러 샷을 다시 만들다 동시에 만드는 영상이 꽉 차면 시작한 샷만 되짚고, 못 한 샷은 "동시에 만드는 영상이 많아 샷 N 영상은 시작하지 못했어요"라고 한다', async () => {
    const failedTake = (id: string, parent: string) => ({ id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: parent, status: 'failed', lastAttemptStatus: 'failed', videoUrl: null, final: false, takeNumber: 1, override: {} } }) as unknown as DirectorNode
    const started: string[] = []
    const remake = vi.fn(async (id: string, opts?: { onAccepted?: (jobId: string) => void }) => {
      if (id === 's1') { started.push(id); opts?.onAccepted?.(`job-${id}`); return `job-${id}` }
      mocks.refusal.mockReturnValue({ shotNodeId: id })
      return null
    })
    director.setState({ nodes: [shot('s1', IMG('s1')), failedTake('v1', 's1'), shot('s2', IMG('s2')), failedTake('v2', 's2'), shot('s4', IMG('s4')), failedTake('v4', 's4')], remakeShotVideo: remake })
    reply([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('실패한 샷 다시 만들어줘')
    expect(started).toEqual(['s1'])
    // 한도에 걸린 뒤의 샷은 더 보내지 않는다(같은 한도에 또 걸린다).
    expect(remake).toHaveBeenCalledTimes(2)
    const said = chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
    expect(said).toContain('Started making videos for Shot 1 · 5 Takes. Progress shows on the line above the cards.')
    expect(said).toContain("Too many videos are being made at once, so I didn't start the video for Shots 2 · 4. Ask again once one is done.")
    expect(translate('ko', "Too many videos are being made at once, so I didn't start the video for {shots}. Ask again once one is done.", { shots: '샷 2·4' })).toBe('동시에 만드는 영상이 많아 샷 2·4 영상은 시작하지 못했어요. 하나가 끝나면 다시 부탁해 주세요.')
  })

  // 왜: lead_rules 3 — 글 카드가 기다리는 샷은 다시 만들기도 그 카드에 묶었다가 [적용] 뒤 새 글로 만든다(이어받는 Take 설정은 그대로).
  it('글 카드가 기다리는 샷의 "다시 만들어줘"는 카드에 묶었다가 [적용]하면 새 글로 다시 만들기를 한다', async () => {
    let promptAtRemake: string | null = null
    const remake = acceptingRemake((id) => { promptAtRemake = promptOf(id) })
    director.setState({ remakeShotVideo: remake })
    reply([{ type: 'updateShot', id: 's4', patch: { prompt: 'Warm' } }])
    await chat.getState().sendMessage('Make shot 4 warm')
    reply([{ type: 'generateVideos', shotIds: ['s4'] }])
    await chat.getState().sendMessage('샷 4 영상 다시 만들어줘')
    expect(remake).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Applying the text card makes the video for Shot 4 with the new text.')
    await expect(chat.getState().approvePendingProposal()).resolves.toBe(true)
    expect(remake.mock.calls.map(([id]) => id)).toEqual(['s4'])
    expect(promptAtRemake).toBe('Warm')
    expect(mocks.run).not.toHaveBeenCalled()
  })

  // 왜: 리드 (a) — 알림 카드 [샷 N 다시 만들기]가 일괄 설정으로 만들어 넘기기 창 [다시 만들기]와 설정이 갈렸다(검토 b 낮음 1). 같은 다시 만들기 하나를 부른다.
  it('알림 카드 [샷 N 다시 만들기]는 넘기기 창 · 샷 상세와 같은 다시 만들기(가장 최근 Take 설정 이어받기)로 만든다', async () => {
    const remake = acceptingRemake()
    director.setState({ remakeShotVideo: remake })
    await chat.getState().startDirectorVideos(['s4'], 'Make Shot 4 again', { remake: true })
    expect(remake.mock.calls.map(([id]) => id)).toEqual(['s4'])
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Started making videos for Shot 4 · 5 Takes. Progress shows on the line above the cards.')
  })

  // 왜: 재재검토 b 낮음 3(C5) — Director 에서 되물은 뒤 다른 단계에서 "좋아"라고 하면 Take 가 묶인 글 카드가 승인돼 영상이 나갔다.
  it('Director 에서 되물은 뒤 다른 단계에서 "좋아"라고 해도 Take 가 묶인 글 카드는 승인되지 않고 영상도 시작하지 않는다', async () => {
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } }, { type: 'generateVideos', shotIds: ['s1', 's2'] }])
    await chat.getState().sendMessage('Make shot 1 warm and make videos for shots 1 and 2')
    expect(chat.getState().pendingProposal?.payload.then).toMatchObject({ videos: ['s1'] })
    expect(chat.getState().directorVideoAsk).toMatchObject({ shotIds: ['s2'] })
    project.setState({ currentStage: 'writer' })
    reply([])
    await chat.getState().sendMessage('좋아')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(promptOf('s1')).toBeNull()
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
  })

  // 왜: lead_rules — Take 가 걸린 카드는 낸 단계에서만 "응"으로 허락된다. 다시 만들기가 묶인 글 카드도 Take 를 쓰니 같은 규칙이다.
  it('다시 만들기가 묶인 글 카드도 Take 가 걸린 카드라 다른 단계에서 "좋아"라고 해도 승인되지 않고 다시 만들지도 않는다', async () => {
    const remake = acceptingRemake()
    director.setState({ remakeShotVideo: remake })
    reply([{ type: 'updateShot', id: 's4', patch: { prompt: 'Warm' } }, { type: 'generateVideos', shotIds: ['s4'] }])
    await chat.getState().sendMessage('샷 4 를 따뜻하게 하고 영상 다시 만들어줘')
    expect(chat.getState().pendingProposal?.payload.then).toMatchObject({ videos: [], remakes: ['s4'] })
    project.setState({ currentStage: 'writer' })
    reply([])
    await chat.getState().sendMessage('좋아')
    expect(remake).not.toHaveBeenCalled()
    expect(promptOf('s4')).toBeNull()
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
  })

  // 왜: 검토 a 통합 낮음 — 번호를 물은 뒤 "3이나 4"(둘 중 하나)를 "3과 4"로 읽어 둘 다 바로 만들었다. "2?"처럼 목록으로 되묻는다.
  it('번호를 물은 뒤 "3이나 4"처럼 고르는 말로 답하면 바로 만들지 않고 "샷 3 · 4 영상 2개를 만들까요?"로 되묻는다', async () => {
    reply([{ type: 'generateVideos', shotIds: ['s2'] }])
    await chat.getState().sendMessage('샷 2 빼고 영상 다 만들어줘')
    expect(chat.getState().directorVideoAsk).toEqual({ projectId: 'p-dir', numbers: true })
    await chat.getState().sendMessage('3이나 4')
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Shall I make 2 videos for Shots 3 · 4 (10 Takes)? Say yes to start.')
    expect(chat.getState().directorVideoAsk).toEqual({ projectId: 'p-dir', shotIds: ['s3', 's4'] })
  })

  // 왜: 검토 a 통합 — 글 카드에 생성을 묶는 사이(잔액을 읽는 동안) 사람이 그 카드를 버리면, 묶기가 끝나며 버린 카드를 다시 띄웠다(버린 글이 [적용]될 수 있었다).
  it('글 카드에 영상을 묶는 사이 그 카드를 버렸으면 카드를 되살리지 않고, 기다리던 생성은 시작하지 않았다고 말한다', async () => {
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } }])
    await chat.getState().sendMessage('Make shot 1 warm')
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
    let release: () => void = () => {}
    vi.mocked(fetchTakeBalance).mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(mocks.balance as never) }))
    reply([{ type: 'generateVideos', shotIds: ['s1'] }])
    const sending = chat.getState().sendMessage('샷 1 영상 만들어줘')
    await vi.waitFor(() => expect(vi.mocked(fetchTakeBalance)).toHaveBeenCalled())
    chat.getState().dismissPendingProposal()
    release()
    await sending
    expect(chat.getState().pendingProposal).toBeNull()
    expect(promptOf('s1')).toBeNull()
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe("The text card closed in the meantime, so I didn't start what was waiting for it. Please ask again.")
    expect(translate('ko', "The text card closed in the meantime, so I didn't start what was waiting for it. Please ask again.")).toBe('그사이 글 카드가 닫혀 그 카드를 기다리던 생성은 시작하지 않았어요. 다시 부탁해 주세요.')
  })

  // 왜: 서버 지시문도 같은 약속을 말해야 모델이 "확인 카드가 뜰 거예요"라고 하지 않는다.
  it('서버 지시문은 그림 · 영상을 바로 만든다고 알리고, 영상은 사용자가 말한 샷만 담게 한다', () => {
    const route = readFileSync(path.join(process.cwd(), 'src/app/api/director/chat/route.ts'), 'utf8')
    expect(route).toContain('It runs at once and uses no Takes.')
    expect(route).toContain('Put in "shotIds" exactly the shots the user named')
    expect(route).not.toContain('approval card')
    // 재재검토 b 보통 C — 부정 · 미룸 · 질문에는 영상 부탁을 내지 않는다.
    expect(route).toContain('If the user says not to make videos, says not now or later, or only asks a question, do not emit generateVideos.')
  })
})

describe('다시 만들기는 접수되는 대로(검토 b (a)~(g) 보통 1)', () => {
  // 진짜 상점의 다시 만들기 길 — 서버는 바로 접수(queued)하고, 그 뒤 확인(5초마다)은 끝나지 않는다(시계를 멈춰 둔다).
  //   샷마다 생성 잠금이 남으므로 시험마다 다른 샷 이름을 쓴다.
  let generated: string[] = []
  /** refuse: 이 샷 요청은 4xx 로 거절하되 몸에 jobId · status queued 를 싣는다(검토 b · entry 가 찾은 거절 꼴). */
  function remakeServer(chatUpdates: unknown[] = [], refuse: readonly string[] = []) {
    generated = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/api/director/chat')) return Response.json({ reply: 'Okay.', updates: chatUpdates })
      if (u.includes('/api/director/generate-video')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { shotId?: string }
        generated.push(String(body.shotId))
        if (refuse.includes(String(body.shotId))) return Response.json({ jobId: `job-${body.shotId}`, status: 'queued', error: 'Bad request' }, { status: 400 })
        return Response.json({ jobId: `job-${body.shotId}`, status: 'queued', videoClipId: `clip-${body.shotId}`, takeNumber: 2 })
      }
      if (u.includes('/api/generation-jobs/')) return Response.json({ ok: true, data: { status: 'queued' } })
      return Response.json({})
    }))
  }
  function remakeBoard(ids: string[]) {
    writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ids.map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
    director.setState({ nodes: ids.flatMap((id) => [shot(id, IMG(id)), failedTake(`v-${id}`, id)]) })
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  // 왜: 검토 b 보통 1 — 다시 만들기가 앞 영상이 끝날 때까지 기다려 둘째 샷이 늦게 나가고, 채팅이 영상이 다 끝날 때까지 "생각 중"이었다. 빠른 칩이 가장 자주 만나는 길이다.
  it('Lumi 의 다시 만들기는 샷마다 접수되는 대로 다음 샷을 보내고, 다 접수되면 바로 시작했다고 말한다(영상이 끝나기를 기다리지 않는다)', async () => {
    remakeBoard(['c1', 'c2'])
    remakeServer()
    await chat.getState().sendMessage(translate('en', DIRECTOR_QUICK_CHIPS[2]))
    expect(generated).toEqual(['c1', 'c2'])
    expect(chat.getState().loading).toBe(false)
    expect(lastModel()).toBe('Started making videos for Shots 1 · 2 · 10 Takes. Progress shows on the line above the cards.')
  })

  // 왜: 검토 b · entry — 거절(4xx) 몸에도 jobId · status queued 가 실려 와, 접수 알림만 보고 세면 거절된 샷도 "시작했어요"와 Take 수에 들어갔다.
  it('remakeShotVideo 의 접수 알림은 서버가 2xx 로 받아 jobId 를 준 때 한 번만 오고, 4xx 거절에는 jobId · queued 가 실려 와도 오지 않는다', async () => {
    remakeBoard(['a1', 'a2'])
    remakeServer([], ['a2'])
    const accepted = vi.fn()
    await new Promise<void>((resolve) => {
      void director.getState().remakeShotVideo('a1', { onAccepted: (jobId) => { accepted(jobId); resolve() } })
    })
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect(accepted.mock.calls).toEqual([['job-a1']])
    accepted.mockClear()
    await director.getState().remakeShotVideo('a2', { onAccepted: accepted })
    expect(generated).toEqual(['a1', 'a2'])
    expect(accepted).not.toHaveBeenCalled()
  })

  // 왜: 위와 같은 까닭 — Lumi 는 2xx 접수만 "시작"으로 세고, 거절된 샷은 따로 말한다(Take 수에도 넣지 않는다).
  it('다시 만들기는 서버가 2xx 로 받아 jobId 를 준 샷만 시작으로 세고, 4xx 로 거절된 샷은 "샷 N 영상을 시작하지 못했어요"라고 따로 말한다', async () => {
    remakeBoard(['r1', 'r2'])
    remakeServer([], ['r2'])
    await chat.getState().sendMessage(translate('en', DIRECTOR_QUICK_CHIPS[2]))
    expect(generated).toEqual(['r1', 'r2'])
    const said = chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
    expect(said).toContain('Started making videos for Shot 1 · 5 Takes. Progress shows on the line above the cards.')
    expect(said).toContain("I couldn't start the video for Shot 2. Please ask again in a moment.")
  })

  // 왜: 검토 b 보탬 — 채팅을 "생각 중"으로 잡던 길은 칩 말고도 셋(알림 카드 · 되묻기 "응" · 번호 대답), 모델을 거치는 채팅 부탁은 둘째 샷이 늦게 나갔다.
  it('알림 카드 [다시 만들기] · 되묻기 "응" · 번호 대답 · 채팅 부탁의 다시 만들기도 영상이 끝나기를 기다리지 않고, 접수되면 바로 시작했다고 말한다', async () => {
    // 알림 카드 [샷 1 다시 만들기]
    remakeBoard(['n1'])
    remakeServer()
    await chat.getState().startDirectorVideos(['n1'], 'Make Shot 1 again', { remake: true })
    expect(generated).toEqual(['n1'])
    expect(chat.getState().loading).toBe(false)
    expect(lastModel()).toBe('Started making videos for Shot 1 · 5 Takes. Progress shows on the line above the cards.')

    // 되물은 목록에 "응"
    remakeBoard(['y1', 'y2', 'y3'])
    remakeServer([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('샷 2 빼고 영상 다 다시 만들어줘')
    expect(chat.getState().directorVideoAsk).toMatchObject({ shotIds: ['y1', 'y3'], remake: true })
    await chat.getState().sendMessage('응')
    expect(generated).toEqual(['y1', 'y3'])
    expect(chat.getState().loading).toBe(false)
    expect(lastModel()).toBe('Started making videos for Shots 1 · 3 · 10 Takes. Progress shows on the line above the cards.')

    // 번호를 물은 뒤 "2번"
    remakeBoard(['k1', 'k2'])
    remakeServer([{ type: 'generateVideos' }])
    await chat.getState().sendMessage('씬 1 영상 다시 만들어줘')
    expect(chat.getState().directorVideoAsk).toEqual({ projectId: 'p-dir', numbers: true, remake: true })
    await chat.getState().sendMessage('2번')
    expect(generated).toEqual(['k2'])
    expect(chat.getState().loading).toBe(false)

    // 모델을 거치는 채팅 부탁
    remakeBoard(['m1', 'm2'])
    remakeServer([{ type: 'generateVideos', shotIds: ['m1', 'm2'] }])
    await chat.getState().sendMessage('샷 1, 2 영상 다시 만들어줘')
    expect(generated).toEqual(['m1', 'm2'])
    expect(lastModel()).toBe('Started making videos for Shots 1 · 2 · 10 Takes. Progress shows on the line above the cards.')
  })
})
