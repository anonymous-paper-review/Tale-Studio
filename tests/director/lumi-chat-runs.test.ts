// Director 에서 Lumi 에게 말로 부탁하면 확인 카드 없이 바로 실행하고(이미지 · 영상), 말하지 않은 샷에는 Take 를 쓰지 않으며, 글은 전 · 후를 보고 적용해야 바뀌고
//   그 글이 걸린 샷의 생성은 [적용]을 기다리는지 검사한다 (오너 2026-11-14 9번 · 검토 b)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
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
import { translate } from '@/lib/i18n/translate'
import { fetchTakeBalance } from '@/lib/billing/use-take-balance'

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
const promptOf = (id: string) => (director.getState().nodes.find((n) => n.id === id)!.data as { promptOverride: string | null }).promptOverride
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
    reply([{ type: 'generateVideos', shotIds: ['s4', 's3'] }])
    await chat.getState().sendMessage('Remake the failed shot videos')
    expect(runShots()).toEqual(['s4'])

    mocks.run.mockClear()
    reply([{ type: 'generateVideos', shotIds: ['s4'] }])
    await chat.getState().sendMessage('Remake the failed shot videos')
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

  // 왜: 글이 걸리지 않은 샷까지 기다리게 하면 9번 "바로 실행"이 깨진다.
  it('글 고침이 걸리지 않은 샷의 영상 · 그림은 같은 답에 글 고침이 있어도 지금처럼 바로 시작한다', async () => {
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ generateStoryboardImage: generate })
    reply([{ type: 'updateShot', id: 's1', patch: { prompt: 'Warm' } }, { type: 'generateVideos', shotIds: ['s2'] }, { type: 'generateImage', id: 's3' }])
    await chat.getState().sendMessage('Make shot 1 warm, the video for shot 2 and the image for shot 3')
    expect(runShots()).toEqual(['s2'])
    expect(generate).toHaveBeenCalledWith('s3', expect.any(Object))
    expect(chat.getState().pendingProposal?.kind).toBe('directorTextEdit')
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

  // 왜: 서버 지시문도 같은 약속을 말해야 모델이 "확인 카드가 뜰 거예요"라고 하지 않는다.
  it('서버 지시문은 그림 · 영상을 바로 만든다고 알리고, 영상은 사용자가 말한 샷만 담게 한다', () => {
    const route = readFileSync(path.join(process.cwd(), 'src/app/api/director/chat/route.ts'), 'utf8')
    expect(route).toContain('It runs at once and uses no Takes.')
    expect(route).toContain('Put in "shotIds" exactly the shots the user named')
    expect(route).not.toContain('approval card')
  })
})
