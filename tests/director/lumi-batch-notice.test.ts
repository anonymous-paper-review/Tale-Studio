// Director 에서 채팅을 접어 둔 채 일괄 생성이 끝나면 오른쪽 아래 Lumi 알림 카드가 끝난 수 · 실패한 샷 · 다음 할 일 단추를 보이고,
//   채팅이 열려 있으면 카드 없이 채팅 말로만 알리는지 검사한다 (11/13 시안 D8 414:5066, 오너 2026-11-14 "추천대로")
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'
import type { DirectorShotState } from '@/lib/director/shot-state'

const mocks = vi.hoisted(() => ({ run: vi.fn(), balance: { balance: 40 as number | null, mode: 'enforce' as 'enforce' | 'shadow' | 'off' } }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
vi.mock('@/lib/billing/use-take-balance', () => ({ fetchTakeBalance: vi.fn(async () => mocks.balance), refetchTakeBalance: vi.fn() }))
vi.mock('@/lib/director/video-batch-client', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/director/video-batch-client')>(), runVideoBatch: mocks.run }))

import { useLumiNoticeStore as notices } from '@/stores/lumi-notice-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore as project } from '@/stores/project-store'
import { useGlobalChatStore as chat } from '@/stores/global-chat-store'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useWriterStore as writer } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { lumiBatchNoticeView } from '@/lib/director/lumi-batch-notice'

const VIDEO = { projectId: 'p-dir', kind: 'video' as const, done: 5, failed: 1 }
const states = (...list: Array<[string, DirectorShotState]>) => new Map(list)
const BOARD = states(['s1', 'video_done'], ['s2', 'video_done'], ['s3', 'video_done'], ['s4', 'video_failed'], ['s5', 'video_done'], ['s6', 'video_done'])
const labelOf = (id: string) => Number(id.slice(1))
/** 러너처럼 — 시작하면 그 자리에서 새 묶음 표시를 단다(끝난 것으로 바로 풀어 다음 부탁을 막지 않는다). */
async function startsBatch(_projectId: string, opts?: { shotIds?: readonly string[] }) {
  director.getState().beginVideoBatch(opts?.shotIds?.length ?? 0)
  director.setState({ videoBatchBusy: false })
  return { total: opts?.shotIds?.length ?? 0, started: opts?.shotIds?.length ?? 0, failed: 0 }
}

function shot(id: string): DirectorNode {
  return { id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, derivedPrompt: `base ${id}`, promptOverride: null, camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider: 'seedance', durationSeconds: 3, storyboardImage: { status: 'completed', url: `https://media.test/${id}.png`, jobId: null }, referenceImages: [], imageInputs: [] } } as unknown as DirectorNode
}

beforeEach(() => {
  vi.clearAllMocks()
  chat.getState().reset()
  project.getState().resetProject()
  project.setState({ currentStage: 'director', reachedStage: 'director', projectId: 'p-dir', projectLocale: 'en', projectLocaleLocked: true })
  useLocaleStore.setState({ locale: 'en' })
  useChatUiStore.setState({ collapsed: true })
  notices.setState({ notice: null })
  mocks.balance = { balance: 40, mode: 'enforce' }
  mocks.run.mockImplementation(startsBatch)
})

describe('Lumi 알림 카드가 뜨는 때(시안 D8)', () => {
  // 왜: 시안 D8 — 채팅을 접어 둔 채 일괄이 끝나면 오른쪽 아래에 끝난 것과 다음 할 일을 알린다(오너 11/14 "추천대로").
  it('채팅을 접어 둔 Director 에서 일괄이 끝나면 Lumi 알림 카드가 뜬다', () => {
    notices.getState().batchEnded(VIDEO)
    expect(notices.getState().notice).toEqual(VIDEO)
  })

  // 왜: 채팅이 열려 있으면 끝난 줄이 채팅에 바로 보인다 — 같은 말을 카드로 또 덮지 않는다. 다른 단계 · 다른 프로젝트에서도 뜨지 않는다.
  it('채팅이 열려 있거나 Director 밖이거나 다른 프로젝트면 카드는 뜨지 않는다', () => {
    useChatUiStore.setState({ collapsed: false })
    notices.getState().batchEnded(VIDEO)
    expect(notices.getState().notice).toBeNull()
    useChatUiStore.setState({ collapsed: true })
    project.setState({ currentStage: 'editor' })
    notices.getState().batchEnded(VIDEO)
    expect(notices.getState().notice).toBeNull()
    project.setState({ currentStage: 'director' })
    notices.getState().batchEnded({ ...VIDEO, projectId: 'p-other' })
    expect(notices.getState().notice).toBeNull()
  })

  // 왜(혼자 정한 것 B): 다음 할 일을 고르기 전에 사라지면 안 된다 — 저절로 닫히지 않는다. 채팅을 열면 같은 줄이 채팅에 있어 카드는 거둔다.
  it('카드는 저절로 닫히지 않고, ✕ 로 닫으며, 채팅을 열거나 Director 를 떠나면 사라진다', () => {
    notices.getState().batchEnded(VIDEO)
    notices.getState().dismiss()
    expect(notices.getState().notice).toBeNull()

    notices.getState().batchEnded(VIDEO)
    useChatUiStore.setState({ collapsed: false })
    expect(notices.getState().notice).toBeNull()

    useChatUiStore.setState({ collapsed: true })
    notices.getState().batchEnded(VIDEO)
    project.setState({ currentStage: 'editor' })
    expect(notices.getState().notice).toBeNull()
  })
})

describe('Lumi 알림 카드의 글과 단추(시안 D8)', () => {
  // 왜: 시안 D8 그대로 — 실패한 영상은 Take 를 돌려드리고, 다시 만들거나 빼고 넘길 수 있다(빼고 넘기기는 다음 단계 단추와 같은 길).
  it('영상이 일부 실패하면 카드는 완성된 수 · 실패한 샷 · Take 를 돌려드린 것을 알리고 [빼고 Editor로] · [샷 N 다시 만들기]를 단다', () => {
    const view = lumiBatchNoticeView({ notice: VIDEO, states: BOARD, labelOf, takesReturned: true, locale: 'ko' })
    expect(view.title).toBe('영상 5개가 완성됐어요')
    expect(view.body).toBe('샷 4 영상은 만들다 실패했어요(Takes는 돌려드렸어요). 다시 만들거나, 빼고 Editor에서 이어 붙일 수 있어요.')
    expect(view.done).toBe(true)
    expect(view.actions).toEqual([
      { kind: 'handoff', label: '빼고 Editor로' },
      { kind: 'videos', label: '샷 4 다시 만들기', shotIds: ['s4'] },
    ])
  })

  // 왜: 다 됐으면 다음은 Editor 다 — 다음 단계 단추와 같은 이름 · 같은 길.
  it('영상이 모두 되면 카드는 [Editor로 넘기기] 하나를 단다', () => {
    const all = states(['s1', 'video_done'], ['s2', 'video_done'])
    const view = lumiBatchNoticeView({ notice: { ...VIDEO, done: 2, failed: 0 }, states: all, labelOf, takesReturned: true, locale: 'en' })
    expect(view.title).toBe('2 videos are done')
    expect(view.body).toBe('Join them into one video in Editor.')
    expect(view.actions).toEqual([{ kind: 'handoff', label: 'Hand over to Editor' }])
  })

  // 왜(혼자 정한 것 D): 과금이 꺼져 있거나 무제한 계정은 Take 를 쓰지 않았다 — "돌려드렸어요"는 틀린 말이다.
  it('Take 를 쓰지 않는 계정이면 "Takes 는 돌려드렸어요"를 말하지 않는다', () => {
    const view = lumiBatchNoticeView({ notice: VIDEO, states: BOARD, labelOf, takesReturned: false, locale: 'ko' })
    expect(view.body).toBe('샷 4 영상은 만들다 실패했어요. 다시 만들거나, 빼고 Editor에서 이어 붙일 수 있어요.')
  })

  // 왜(혼자 정한 것 A): 이미지 일괄 뒤 다음 할 일은 영상 — 수는 "이미지 나온 샷 영상" 칩 · 위쪽 [영상 만들기]와 같은 샷(이미지 완료 · 영상 실패).
  it('이미지 일괄 뒤 카드는 [영상 만들기 · N]을 단다 — N 은 이미지 나온 샷 영상 칩과 같은 샷이다', () => {
    const board = states(['s1', 'image_done'], ['s2', 'image_done'], ['s3', 'video_failed'], ['s4', 'image_needed'], ['s5', 'video_done'])
    const view = lumiBatchNoticeView({ notice: { projectId: 'p-dir', kind: 'image', done: 2, failed: 1 }, states: board, labelOf, takesReturned: true, locale: 'ko' })
    expect(view.title).toBe('실사 이미지 2장이 완성됐어요')
    expect(view.body).toBe('1장은 만들지 못했어요. 위쪽 이미지 만들기로 다시 만들 수 있어요.')
    expect(view.actions).toEqual([{ kind: 'videos', label: '영상 만들기 · 3', shotIds: ['s1', 's2', 's3'] }])
  })
})

describe('Lumi 알림 카드 단추가 하는 일', () => {
  // 왜: 카드 단추도 Lumi 에게 부탁한 것과 같다 — 누른 말이 채팅에 남고, 영상은 Take 를 세어 그 샷만 바로 만든다(오너 9번).
  it('알림 카드에서 [샷 N 다시 만들기]를 누르면 누른 말을 채팅에 남기고 그 샷 영상만 Take 를 세어 바로 만든다', async () => {
    writer.setState({ sceneManifest: { scenes: [{ sceneId: 'sc1' }] } as never, shots: ['s1', 's2'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })) as never })
    director.setState({ projectId: 'p-dir', nodes: [shot('s1'), shot('s2')], edges: [], videoBatchBusy: false })
    await chat.getState().startDirectorVideos(['s2'], 'Make Shot 2 again')
    expect(mocks.run).toHaveBeenCalledWith('p-dir', expect.objectContaining({ shotIds: ['s2'] }))
    expect(chat.getState().messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Make Shot 2 again'],
      ['model', 'Started making videos for Shot 2 · 5 Takes. Progress shows on the line above the cards.'],
    ])
  })
})
