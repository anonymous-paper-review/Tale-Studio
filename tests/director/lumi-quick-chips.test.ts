// Director 채팅의 빠른 칩 넷(이미지 필요한 샷 · 이미지 나온 샷 영상 · 실패한 샷 다시 · 지금 어디까지)이 누르면 바로 보내져 AI 를 거치지 않고 그 일을 하고,
//   해당 샷이 없으면 "지금 그런 샷이 없어요"라고 답하는지 검사한다 (11/13 시안 D5, 오너 2026-11-14 "추천대로" · 9번)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'

const mocks = vi.hoisted(() => ({ run: vi.fn(), real: vi.fn(), balance: { balance: 40 as number | null, mode: 'enforce' as 'enforce' | 'shadow' | 'off' } }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn(async () => mocks.balance), refetchTakeBalance: vi.fn() }))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(), runVideoBatch: mocks.run }))
vi.mock('@/lib/director/real-batch-client', () => ({ runRealBatch: mocks.real }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { DIRECTOR_QUICK_CHIPS, STAGE_PLACEHOLDER } from '@/lib/constants'
import { translate } from '@/lib/i18n/translate'

const originalGenerate = director.getState().generateStoryboardImage
const IMG = (id: string, status = 'completed') => ({ status, url: status === 'completed' ? `https://media.test/${id}.png` : null, jobId: null })
function shot(id: string, image: unknown = null): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, derivedPrompt: `base ${id}`, promptOverride: null, camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider: 'seedance', durationSeconds: 3, storyboardImage: image, referenceImages: [], imageInputs: [] } } as unknown as DirectorNode
}
function take(id: string, parent: string, status: 'completed' | 'failed' | 'generating'): DirectorNode {
  return { id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: parent, status, lastAttemptStatus: status, videoUrl: status === 'completed' ? `https://media.test/${id}.mp4` : null, final: false, takeNumber: 1, override: {} } } as unknown as DirectorNode
}
// 샷 1: 이미지 · 영상 완성 / 샷 2: 이미지만 / 샷 3: 이미지 없음 / 샷 4: 이미지 실패 / 샷 5: 이미지 · 영상 실패
const NODES = () => [
  shot('s1', IMG('s1')), take('v1', 's1', 'completed'),
  shot('s2', IMG('s2')),
  shot('s3'),
  shot('s4', IMG('s4', 'failed')),
  shot('s5', IMG('s5')), take('v5', 's5', 'failed'),
]
const fetchMock = vi.fn(async () => Response.json({ reply: 'Model reply' }))
const lastModel = () => chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''
const chip = (index: number) => translate('en', DIRECTOR_QUICK_CHIPS[index])
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
  writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ['s1', 's2', 's3', 's4', 's5'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
  director.setState({ projectId: 'p-dir', nodes: NODES(), edges: [], selectedNodeId: null, videoBatchBusy: false, realBatchBusy: false, generateStoryboardImage: originalGenerate })
  mocks.balance = { balance: 40, mode: 'enforce' }
  mocks.run.mockImplementation(startsBatch)
  mocks.real.mockResolvedValue({ generated: 1, quotaBlocked: false })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  director.setState({ generateStoryboardImage: originalGenerate })
  vi.unstubAllGlobals()
})

describe('Director 빠른 칩(시안 D5)', () => {
  // 왜: 시안 D5 — 입력칸 위 빠른 칩 넷 · 입력칸 안내 "예: 샷 1 조명을 네온 블루로"(오너 11/14 "추천대로").
  it('Director 빠른 칩은 넷이고 입력칸 안내는 "예: 샷 1 조명을 네온 블루로"다', () => {
    expect(DIRECTOR_QUICK_CHIPS.map((key) => translate('ko', key))).toEqual([
      '이미지 필요한 샷 모두 만들어 줘',
      '이미지 나온 샷 영상 만들어 줘',
      '실패한 샷 다시 만들어 줘',
      '지금 어디까지 됐어?',
    ])
    expect(translate('ko', STAGE_PLACEHOLDER.director)).toBe('예: 샷 1 조명을 네온 블루로')
    expect(translate('en', STAGE_PLACEHOLDER.director)).toBe("E.g. make shot 1's lighting neon blue")
  })

  // 왜(혼자 정한 것 A): 칩은 화면 상태로 바로 한다 — AI 가 말을 잘못 읽을 일이 없고 채팅 비용도 없다. 보낸 말은 채팅에 남는다.
  it('빠른 칩을 누르면 그 말을 바로 보내고, AI 를 거치지 않고 그 일을 한다', async () => {
    await chat.getState().sendMessage(chip(0))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.real).toHaveBeenCalledWith('p-dir')
    expect(chat.getState().messages.at(-2)).toMatchObject({ role: 'user', content: chip(0) })
    expect(lastModel()).toBe('Started making live-action images for 2 shots · No Takes used. Progress shows on the line above the cards.')
  })

  // 왜: "이미지 나온 샷 영상 만들어 줘" — 이미지가 나온 샷 중 영상이 없는 샷만, Take 를 세어 바로(오너 9번). 실패한 영상 샷도 이미지가 나왔으면 다시 든다.
  it('이미지 나온 샷 영상 칩은 이미지가 나온 샷 중 영상이 없는 샷만 Take 를 세어 바로 만든다', async () => {
    await chat.getState().sendMessage(chip(1))
    expect(mocks.run).toHaveBeenCalledWith('p-dir', expect.objectContaining({ shotIds: ['s2', 's5'] }))
    expect(lastModel()).toBe('Started making videos for Shots 2 · 5 · 10 Takes. Progress shows on the line above the cards.')
  })

  // 왜: "실패한 샷 다시 만들어 줘" — 이미지가 실패한 샷은 다시 그리고(Take 안 씀), 영상이 실패한 샷은 새로 만든다(Take, 모자라면 시작 안 함).
  it('실패한 샷 다시 만들어 줘 칩은 이미지가 실패한 샷은 다시 그리고 영상이 실패한 샷은 다시 만든다', async () => {
    const generate = vi.fn().mockResolvedValue(null)
    director.setState({ generateStoryboardImage: generate })
    await chat.getState().sendMessage(chip(2))
    expect(generate).toHaveBeenCalledWith('s4')
    expect(generate).toHaveBeenCalledTimes(1)
    expect(mocks.run).toHaveBeenCalledWith('p-dir', expect.objectContaining({ shotIds: ['s5'] }))
    const said = chat.getState().messages.filter((m) => m.role === 'model').map((m) => m.content)
    expect(said).toContain('Started making live-action images for Shot 4 · No Takes used. Progress shows on the line above the cards.')
    expect(said).toContain('Started making videos for Shot 5 · 5 Takes. Progress shows on the line above the cards.')
  })

  // 왜: 시안 D5 의 칩은 늘 보인다 — 할 일이 없을 때 누르면 아무것도 만들지 않고 그렇다고 말한다(오너 11/14 "추천대로").
  it('해당 샷이 없으면 아무것도 만들지 않고 "지금 그런 샷이 없어요"라고 답한다', async () => {
    director.setState({ nodes: [shot('s1', IMG('s1')), take('v1', 's1', 'completed')] })
    for (const index of [0, 1, 2]) {
      await chat.getState().sendMessage(chip(index))
      expect(lastModel(), chip(index)).toBe('There are no such shots right now.')
    }
    expect(mocks.real).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것 E): 실사 일괄이 도는 동안은 버튼도 잠긴다 — 칩도 새로 시작하지 않고 이유를 말한다(같은 그림을 두 번 그리지 않게).
  it('실사 이미지 일괄이 이미 돌고 있으면 이미지 칩은 새로 시작하지 않고 끝난 뒤 다시 하라고 말한다', async () => {
    director.setState({ realBatchBusy: true })
    await chat.getState().sendMessage(chip(0))
    expect(mocks.real).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Batch live-action generation is running. Try again after it finishes.')
  })

  // 왜(혼자 정한 것 F): 프로젝트를 막 바꿔 보드를 아직 안 읽었을 때 — 앞 프로젝트 보드의 샷을 만들면 안 된다.
  it('다른 프로젝트의 보드가 남아 있으면 칩은 그 보드의 샷을 만들지 않는다', async () => {
    director.setState({ projectId: 'p-old' })
    await chat.getState().sendMessage(chip(0))
    await chat.getState().sendMessage(chip(1))
    expect(mocks.real).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
    expect(lastModel()).toBe('There are no such shots right now.')
  })

  // 왜(혼자 정한 것 C): "지금 어디까지 됐어?"는 생성 없이 수로 답한다 — 실패한 샷은 번호까지.
  it('"지금 어디까지 됐어?" 칩은 생성 없이 이미지 · 영상 완성 수와 만드는 중 · 실패를 수로 답한다', async () => {
    director.setState({ nodes: [...NODES(), shot('s6', IMG('s6', 'generating'))] })
    writer.setState({ shots: ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
    await chat.getState().sendMessage(chip(3))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lastModel()).toBe('Images 3/6 · videos 1/6 done · making 1 · failed 2 (Shots 4 · 5)')
    // 한국어 화면도 같은 수로.
    project.setState({ projectLocale: 'ko' })
    await chat.getState().sendMessage(translate('ko', DIRECTOR_QUICK_CHIPS[3]))
    expect(lastModel()).toBe('이미지 3/6 · 영상 1/6 완성 · 만드는 중 1 · 실패 2(샷 4·5)')
  })
})
