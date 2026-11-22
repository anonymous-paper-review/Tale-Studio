// 샷 정보를 다 읽기 전 · 못 불러옴일 때 Director · Cinema 채팅 빠른 칩(과 같은 말)이 아무것도 만들지 않고 "아직 다 불러오지 못했어요"라고만 답하는지 검사한다 (리드 2026-11-23 판 읽기 뒷마무리)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'

const mocks = vi.hoisted(() => ({ run: vi.fn(), real: vi.fn() }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn(async () => ({ balance: 40, mode: 'enforce' })), refetchTakeBalance: vi.fn() }))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(), runVideoBatch: mocks.run }))
vi.mock('@/lib/director/real-batch-client', () => ({ runRealBatch: mocks.real }))

import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { markBoardLoad, useBoardLoadStore } from '@/stores/board-load-store'
import { DIRECTOR_QUICK_CHIPS } from '@/lib/constants'
import { translate } from '@/lib/i18n/translate'

const originalGenerate = director.getState().generateStoryboardImage
const originalRemake = director.getState().remakeShotVideo
const IMG = (id: string, status = 'completed') => ({ status, url: status === 'completed' ? `https://media.test/${id}.png` : null, jobId: null })
function shot(id: string, image: unknown = null): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, derivedPrompt: `base ${id}`, promptOverride: null, camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider: 'seedance', durationSeconds: 3, storyboardImage: image, referenceImages: [], imageInputs: [] } } as unknown as DirectorNode
}
function take(id: string, parent: string, status: 'completed' | 'failed'): DirectorNode {
  return { id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: parent, status, lastAttemptStatus: status, videoUrl: status === 'completed' ? `https://media.test/${id}.mp4` : null, final: false, takeNumber: 1, override: {} } } as unknown as DirectorNode
}
// 읽다 만 판(이 브라우저에 남은 옛 노드) — 셈으로는 이미지 필요 · 영상 없음 · 실패가 다 있다.
const NODES = () => [shot('s2', IMG('s2')), shot('s3'), shot('s4', IMG('s4', 'failed')), shot('s5', IMG('s5')), take('v5', 's5', 'failed')]
const LINE_EN = "The shots haven't finished loading yet. Please ask again once they're loaded."
const LINE_KO = '샷을 아직 다 불러오지 못했어요. 불러온 뒤 다시 말해 주세요.'
const fetchMock = vi.fn(async () => Response.json({ reply: 'Model reply' }))
const lastModel = () => chat.getState().messages.filter((m) => m.role === 'model').at(-1)?.content ?? ''
const chip = (index: number) => translate('en', DIRECTOR_QUICK_CHIPS[index])
const generate = vi.fn().mockResolvedValue(null)
const remake = vi.fn().mockResolvedValue(null)

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'director', reachedStage: 'director', projectId: 'p-dir', projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ['s2', 's3', 's4', 's5'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
  director.setState({ projectId: 'p-dir', nodes: NODES(), edges: [], selectedNodeId: null, videoBatchBusy: false, realBatchBusy: false, realBatchShotIds: null, realBatchCancelled: false, videoBatchQueue: null, videoBatchCancelled: false, generateStoryboardImage: generate, remakeShotVideo: remake })
  useBoardLoadStore.setState({ projectId: null, status: 'loading', retry: null })
  mocks.real.mockResolvedValue({ generated: 1, quotaBlocked: false })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  director.setState({ generateStoryboardImage: originalGenerate, remakeShotVideo: originalRemake })
  vi.unstubAllGlobals()
})

describe('판 읽기 뒷마무리 — 같이 정한 것(리드 11/23)', () => {
  it('샷 정보를 다 읽기 전 · 못 불러옴일 때 채팅 빠른 칩(이미지 필요한 샷 모두 · 이미지 나온 샷 영상 · 실패한 샷 다시)과 같은 뜻의 글은 아무것도 만들지 않고 "샷을 아직 다 불러오지 못했어요. 불러온 뒤 다시 말해 주세요."라고만 답한다', async () => {
    // 왜: 위쪽 만들기 단추를 껐는데 채팅으로는 읽지 못한 판의 셈으로 만들기가 시작될 수 있다(QA B 와 같은 위험, 리드 11/23).
    expect(translate('ko', LINE_EN)).toBe(LINE_KO)
    for (const status of ['loading', 'failed'] as const) {
      markBoardLoad('p-dir', status)
      for (const index of [0, 1, 2]) {
        await chat.getState().sendMessage(chip(index))
        expect(chat.getState().messages.at(-2), `${status} ${chip(index)}`).toMatchObject({ role: 'user', content: chip(index) })
        expect(lastModel(), `${status} ${chip(index)}`).toBe(LINE_EN)
      }
    }
    expect(mocks.real).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
    expect(remake).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('판 읽기 뒷마무리 — 혼자 정한 것(되돌리기 쉬움)', () => {
  it('다 읽기 전 · 못 불러옴일 때 "지금 어디까지 됐어?" 칩도 같은 줄로 답한다', async () => {
    // 왜: 읽다 만 판으로 센 진행 숫자는 틀린 말이다(리드 11/23 "같은 줄로 답해도 돼요").
    markBoardLoad('p-dir', 'loading')
    await chat.getState().sendMessage(chip(3))
    expect(lastModel()).toBe(LINE_EN)
  })

  it('다 읽은 판, 또는 판 읽기 기록이 없는 때는 빠른 칩을 지금처럼 받는다', async () => {
    // 왜: 정상 경로 고정. 기록이 없으면(판을 읽는 화면이 없을 때) 막을 근거가 없다 — 다른 프로젝트 기록도 이 프로젝트를 막지 않는다.
    markBoardLoad('p-dir', 'ready')
    await chat.getState().sendMessage(chip(0))
    expect(mocks.real).toHaveBeenCalledWith('p-dir')
    expect(lastModel()).not.toBe(LINE_EN)
    vi.clearAllMocks()
    mocks.real.mockResolvedValue({ generated: 1, quotaBlocked: false })
    markBoardLoad('p-other', 'failed')
    await chat.getState().sendMessage(chip(0))
    expect(mocks.real).toHaveBeenCalledWith('p-dir')
    expect(lastModel()).not.toBe(LINE_EN)
  })
})
