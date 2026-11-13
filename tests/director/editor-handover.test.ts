// Director → Editor 넘기기(D8): 영상이 없는 샷이 있을 때만 창을 열고, 창은 샷마다 Editor 로 갈 영상과 없는 까닭을 보이며, 영상 있는 샷만 넘기거나 그 자리에서 다시 만든다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorNode } from '@/types/director'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_stage: 'director' }, error: null }) }) }),
    }),
  }),
}))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn(), saveChatTrace: vi.fn(), saveChatTracePatch: vi.fn(), loadLatestChatTrace: vi.fn() }))
const nav = vi.hoisted(() => ({ handoffToStage: vi.fn(async (stage: string) => `/studio/${stage}`) }))
vi.mock('@/lib/stage-nav', () => ({ handoffToStage: nav.handoffToStage }))

import { editorHandoverView } from '@/lib/director/editor-handover'
import { boardNodeNames } from '@/features/director/node-label'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useWriterStore } from '@/stores/writer-store'
import { resetActionGuard } from '@/lib/action-guard'

// 이 시험을 위해 지은 Director 캔버스 — 씬 하나에 샷 셋(보드 순서 a1 · a2 · a3), 샷마다 영상 Take 를 붙인다.
const manifest = { scenes: [{ sceneId: 'sc_1' }] }
const writerShots = ['a1', 'a2', 'a3'].map((shotId) => ({ shotId, sceneId: 'sc_1' }))
const names = boardNodeNames(manifest, writerShots)
function shot(writerShotId: string, seconds: number): DirectorNode {
  return {
    id: `n_${writerShotId}`, type: 'shot', position: { x: 0, y: 0 },
    data: { kind: 'shot', label: writerShotId, writerShotId, durationSeconds: seconds, storyboardImage: { status: 'completed', url: `https://media.example/${writerShotId}.png` } },
  } as unknown as DirectorNode
}
function take(writerShotId: string, takeNumber: number, status: string, extra: Record<string, unknown> = {}): DirectorNode {
  return {
    id: `v_${writerShotId}_${takeNumber}`,
    type: 'video',
    position: { x: 0, y: 0 },
    data: {
      kind: 'video', label: `take_v${takeNumber}`, parentShotNodeId: `n_${writerShotId}`, takeNumber, status,
      videoUrl: status === 'completed' ? `https://media.example/${writerShotId}_${takeNumber}.mp4` : null,
      final: false, lastAttemptStatus: status, lastAttemptAt: `2026-11-14T0${takeNumber}:00:00Z`, createdAt: `2026-11-14T0${takeNumber}:00:00Z`,
      ...extra,
    },
  } as unknown as DirectorNode
}
const canvas = (...nodes: DirectorNode[]) => [shot('a1', 3), shot('a2', 4), shot('a3', 2), ...nodes]

describe('Editor 넘기기 창이 보여 줄 것', () => {
  // 왜: 영상이 없는 샷은 타임라인에 빈 칸으로 들어가지 않는다(오너 답 8번) — 넘기기 전에 어느 샷이 왜 빠지는지 보드 순서로 보여야 고를 수 있다(시안 D8).
  it('영상이 없는 샷이 있으면 넘기기 창은 샷마다 Editor 로 가는 영상이 있는지와 없는 까닭을 보드 순서로 보여 준다', () => {
    const view = editorHandoverView(canvas(take('a1', 2, 'completed'), take('a2', 1, 'failed')), names)
    expect(view.shots.map((row) => [row.label, row.take?.number ?? null, row.missing])).toEqual([
      ['Scene 1 · Shot 1', 2, null],
      ['Scene 1 · Shot 2', null, 'failed'],
      ['Scene 1 · Shot 3', null, 'not_made'],
    ])
  })

  // 왜: Editor 와 내보내기는 ★ 최종 Take 를 먼저 쓰고, 없으면 가장 최근 완성 Take 를 쓴다(selectHandoffTake) — 창도 같은 Take 를 말해야 한다.
  it('★ 최종 Take 가 있으면 그 Take 가, 없으면 가장 최근 완성 Take 가 Editor 로 간다고 보여 준다', () => {
    const view = editorHandoverView(canvas(take('a1', 1, 'completed', { final: true }), take('a1', 2, 'completed'), take('a2', 1, 'completed'), take('a2', 3, 'completed')), names)
    expect(view.shots.slice(0, 2).map((row) => row.take)).toEqual([{ number: 1, final: true }, { number: 3, final: false }])
  })

  // 왜: 만드는 중인 샷을 "실패"나 "안 만듦"으로 보이면, 기다리면 되는데 다시 만들어 Take 를 또 쓴다.
  it('만드는 중인 샷은 영상이 없는 까닭을 만드는 중으로 보여 준다', () => {
    const view = editorHandoverView(canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed'), take('a3', 1, 'generating')), names)
    expect(view.missing.map((row) => [row.label, row.missing])).toEqual([['Scene 1 · Shot 3', 'generating']])
  })

  // 왜: Editor 에 들어가는 것은 영상이 있는 샷뿐이다(오너 답 8번) — 단추의 컷 수 · 길이도 그것만 센다.
  it('넘어가는 컷 수와 길이는 영상이 있는 샷만 센다', () => {
    const view = editorHandoverView(canvas(take('a1', 1, 'completed'), take('a3', 1, 'completed')), names)
    expect({ cuts: view.cuts, seconds: view.seconds, total: view.total }).toEqual({ cuts: 2, seconds: 5, total: 3 })
  })

  // 왜: 정상 경로 고정 — 모든 샷에 영상이 있으면 창 없이 넘긴다(10/1 "Director → Editor 는 창 없이").
  it('모든 샷에 영상이 있으면 영상 없는 샷 목록은 비어 있다', () => {
    const view = editorHandoverView(canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed'), take('a3', 1, 'completed')), names)
    expect(view.missing).toEqual([])
  })
})

const userLines = () => useGlobalChatStore.getState().messages.filter((m) => m.role === 'user').map((m) => m.content)

describe('Director 의 다음 단계 버튼과 Editor 넘기기 창', () => {
  beforeEach(() => {
    resetActionGuard()
    nav.handoffToStage.mockClear()
    useLocaleStore.setState({ locale: 'ko' })
    useGlobalChatStore.getState().reset()
    useProjectStore.getState().resetProject()
    useProjectStore.setState({ projectId: 'proj-1', currentStage: 'director', reachedStage: 'director' })
    useWriterStore.setState({ sceneManifest: manifest as never, shots: writerShots as never })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ ok: true }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    useDirectorCanvasStore.setState({ nodes: [] })
    useLocaleStore.setState({ locale: 'en' })
  })

  // 왜: 정상 경로 고정 — 다 만든 사람에게 확인 창을 또 띄우지 않는다(10/1 오너 "그 구간은 일단 없이").
  it('Director에서 다음 단계 버튼을 누를 때 모든 샷에 영상이 있으면 창 없이 넘김 문장을 남기고 Editor로 넘어간다', async () => {
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed'), take('a3', 1, 'completed')) })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(userLines()).toEqual(['Editor로 넘겨주세요'])
    expect(nav.handoffToStage).toHaveBeenCalledWith('editor')
  })

  // 왜: 영상 없는 샷을 모른 채 넘기면 Editor 에서 그 샷이 사라진다 — 넘기기 전에 빼고 넘길지 다시 만들지 고르게 한다(시안 D8).
  it('Director에서 다음 단계 버튼을 누를 때 영상이 없는 샷이 있으면 넘기지 않고 Editor 넘기기 창을 연다', async () => {
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed')) })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toMatchObject({ kind: 'editorMissingVideos', projectId: 'proj-1' })
    expect(userLines()).toEqual([])
    expect(nav.handoffToStage).not.toHaveBeenCalled()
  })

  // 왜: 창의 [○ 빼고 넘기기] 가 곧 넘김이다 — Editor 는 영상 있는 샷만 컷으로 만든다(Editor 쪽은 export 갈래).
  it('Editor 넘기기 창에서 영상 있는 샷만 넘기기를 누르면 넘김 문장이 채팅에 남고 Editor로 넘어간다', async () => {
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed')) })
    await useGlobalChatStore.getState().requestNextStep()
    await useGlobalChatStore.getState().proceedToEditorWithVideos()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(userLines()).toEqual(['Editor로 넘겨주세요'])
    expect(nav.handoffToStage).toHaveBeenCalledWith('editor')
  })

  // 왜: [돌아가기] · ✕ 는 마음을 바꾼 것이다 — 넘기거나 채팅에 남기지 않는다.
  it('Editor 넘기기 창을 닫으면 아무것도 넘기지 않는다', async () => {
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed')) })
    await useGlobalChatStore.getState().requestNextStep()
    useGlobalChatStore.getState().closeHandoffConfirm()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(userLines()).toEqual([])
    expect(nav.handoffToStage).not.toHaveBeenCalled()
  })

  // 왜: 창에서 다시 만들고 기다렸다가 넘길 수 있어야 한다 — 단추에 Take 값이 적혀 있어 그 단추가 곧 확인이다(혼자 정한 것).
  it('Editor 넘기기 창에서 영상 없는 샷의 다시 만들기를 누르면 그 샷의 영상을 만들기 시작하고 창은 그대로 둔다', async () => {
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed'), take('a3', 1, 'completed')) })
    const makeVideo = vi.fn(async () => 'v_new')
    useDirectorCanvasStore.setState({ generateVideoForShot: makeVideo } as never)
    await useGlobalChatStore.getState().requestNextStep()
    await useGlobalChatStore.getState().remakeMissingVideo('n_a2')
    expect(makeVideo).toHaveBeenCalledWith('n_a2')
    expect(useGlobalChatStore.getState().handoffConfirm).toMatchObject({ kind: 'editorMissingVideos' })
    expect(nav.handoffToStage).not.toHaveBeenCalled()
  })

  // 왜: Storyboard 카드(board 갈래)의 [빼고 Editor로] 는 넘기기 창을 열지 않고 이 넘김을 바로 부른다(2026-11-14 board 와 약속).
  it('넘기기 창을 열지 않고 [빼고 Editor로]를 눌러도 넘김 문장이 채팅에 남고 영상 있는 샷만 Editor로 넘어간다', async () => {
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed')) })
    await useGlobalChatStore.getState().proceedToEditorWithVideos()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(userLines()).toEqual(['Editor로 넘겨주세요'])
    expect(nav.handoffToStage).toHaveBeenCalledWith('editor')
  })

  // 왜: Storyboard 카드(board 갈래)의 [다시 만들기] 도 창 없이 부른다 — 단추에 Take 값이 적혀 있어 그 단추가 곧 확인이다(리드 2026-11-14).
  it('넘기기 창을 열지 않고 영상 없는 샷의 [다시 만들기]를 눌러도 그 샷의 영상을 만들기 시작한다', async () => {
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed'), take('a3', 1, 'completed')) })
    const makeVideo = vi.fn(async () => 'v_new')
    useDirectorCanvasStore.setState({ generateVideoForShot: makeVideo } as never)
    await useGlobalChatStore.getState().remakeMissingVideo('n_a2')
    expect(makeVideo).toHaveBeenCalledWith('n_a2')
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(nav.handoffToStage).not.toHaveBeenCalled()
  })

  // 왜(혼자 정한 것): 채팅으로 넘겨 달라고 해도 같은 판단을 탄다 — Director 준비 창이 채팅에서도 열리는 것과 같게.
  it('채팅으로 Editor로 넘겨 달라고 해도 영상이 없는 샷이 있으면 같은 창을 연다', async () => {
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed')) })
    await useGlobalChatStore.getState().sendMessage('Editor로 넘겨줘')
    expect(useGlobalChatStore.getState().handoffConfirm).toMatchObject({ kind: 'editorMissingVideos', via: 'chat' })
    expect(nav.handoffToStage).not.toHaveBeenCalled()
  })
})
