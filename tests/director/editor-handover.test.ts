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

import { editorHandoverView, proceedButtonLabel, remakeButton } from '@/lib/director/editor-handover'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { translate } from '@/lib/i18n/translate'
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

  // 왜(검토 b 보통 1): Editor 는 DB 샷(Writer 샷)만 컷으로 받는다. Director 에서 더한 빈 'New Shot' 하나로 창이 열리고(10/1 위반),
  //   그 줄 [영상 만들기]는 이미지 값을 쓴 뒤 서버가 400 으로 거절해 "만들다 실패했어요"로 남았다.
  it('Director 에서 더한 샷(Writer 샷이 아닌 것)은 Editor 넘기기 창에 넣지 않는다', () => {
    const added = { id: 'n_new', type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: 'New Shot', writerShotId: null, durationSeconds: 5, storyboardImage: null } } as unknown as DirectorNode
    const view = editorHandoverView([...canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed'), take('a3', 1, 'completed')), added], names)
    expect(view.shots.map((row) => row.shotNodeId)).toEqual(['n_a1', 'n_a2', 'n_a3'])
    expect({ missing: view.missing.length, total: view.total, cuts: view.cuts }).toEqual({ missing: 0, total: 3, cuts: 3 })
  })
})

describe('Editor 넘기기 창의 단추 글', () => {
  const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)
  const failedRow = { shotNodeId: 'n_a2', missing: 'failed' as const }

  // 왜(검토 b 낮음 4): 한국어 "다시 만들기 · Take 5"는 바로 위 줄의 "Take 2 · 자동"과 겹쳐 Take 번호처럼 읽힌다 — 앱의 값 표기 "5 Take"로 쓴다.
  it('한국어 Editor 넘기기 창의 만들기 단추는 Take 값을 "5 Take"처럼 적는다', () => {
    const nodes = canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed'))
    expect(remakeButton(nodes, failedRow, { showTakes: true, batch: null }, ko).label).toBe('다시 만들기 · 5 Take')
    expect(remakeButton(nodes, { shotNodeId: 'n_a3', missing: 'not_made' }, { showTakes: true, batch: null }, ko).label).toBe('영상 만들기 · 5 Take')
  })

  // 왜(검토 b 낮음 5): Take 과금이 꺼진 때는 노드의 Take 값도 숨긴다(#payments-phase-2) — 넘기기 창도 같은 규칙.
  it('Take 과금이 꺼져 있으면 Editor 넘기기 창의 만들기 단추에 Take 값을 적지 않는다', () => {
    const nodes = canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed'))
    expect(remakeButton(nodes, failedRow, { showTakes: false, batch: null }, ko).label).toBe('다시 만들기')
  })

  // 왜(검토 b 낮음 1): 이미지 · 영상 일괄이 도는 동안 줄 단추를 누르면 요청 · Take · 알림 없이 말없이 끝났다 — 끄고 까닭을 보인다(그리드와 같은 판단).
  it('이미지 · 영상 일괄을 만드는 중이면 Editor 넘기기 창의 만들기 단추를 끄고 "이미지 만드는 중" · "영상 만드는 중"이라고 보인다', () => {
    const nodes = canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed'))
    expect(remakeButton(nodes, failedRow, { showTakes: true, batch: 'images' }, ko)).toEqual({ label: '이미지 만드는 중', disabled: true })
    expect(remakeButton(nodes, failedRow, { showTakes: true, batch: 'videos' }, ko)).toEqual({ label: '영상 만드는 중', disabled: true })
    expect(remakeButton(nodes, failedRow, { showTakes: true, batch: null }, ko).disabled).toBe(false)
  })

  // 왜(검토 b 낮음 3): 창을 연 채 다시 만들기가 다 끝나면 "영상 없는 샷 0개 빼고 넘기기"가 됐다 — 빠질 샷이 없으면 시안 D8 의 "Editor로 넘기기 · 컷 N · N초".
  it('넘기기 창이 열린 채 빠질 샷이 없어지면 넘기기 단추는 "Editor로 넘기기 · 컷 N · N초"가 된다', () => {
    const done = editorHandoverView(canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed'), take('a3', 1, 'completed')), names)
    expect(proceedButtonLabel(done, ko)).toBe('Editor로 넘기기 · 컷 3 · 9초')
    const oneLeft = editorHandoverView(canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed')), names)
    expect(proceedButtonLabel(oneLeft, ko)).toBe('Scene 1 · Shot 3 빼고 넘기기 · 컷 2 · 7초')
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
  // 시험마다 바꿔 끼운 Director 동작(영상 · 이미지 만들기 · 다시 읽기)을 원래 것으로 되돌린다 — 다음 시험이 진짜 요청을 본다.
  const { generateVideoForShot, generateStoryboardImage, hydrateFreshFromDb } = useDirectorCanvasStore.getState()
  afterEach(() => {
    vi.restoreAllMocks()
    useDirectorCanvasStore.setState({ nodes: [], generateVideoForShot, generateStoryboardImage, hydrateFreshFromDb })
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
    expect(makeVideo).toHaveBeenCalledWith('n_a2', { inheritFromVideoNodeId: 'v_a2_1' })
    expect(useGlobalChatStore.getState().handoffConfirm).toMatchObject({ kind: 'editorMissingVideos' })
    expect(nav.handoffToStage).not.toHaveBeenCalled()
  })

  // 왜(검토 b 보통 2): 단추 값은 배선한 Take(1080p)로 세면서 실제 요청은 마더 설정 · 720p · 배선 없이 나갔다 — 확인 창이 없어 단추 값이 곧 동의라
  //   반드시 같아야 한다. 다시 만들 Take 를 한 함수가 고르고, 요청은 그 Take 의 배선 · 모델 · 해상도를 물려받는 새 Take 다.
  it('배선한 Take 가 있는 샷의 [다시 만들기]는 단추에 적힌 Take 와 같은 모델 · 해상도 · 배선으로 만든다', async () => {
    const wired = take('a2', 1, 'failed', {
      override: { provider: 'seedance', resolution: '1080p' },
      frameInputs: { start: 'https://media.example/a1_last.png', end: null, refs: [] },
      standaloneVideoKey: null,
      videoClipId: null,
      videoChainInputId: null,
      videoChainFrameUrl: null,
    })
    // 요청을 조립할 수 있는 샷(프롬프트 · 카메라 · 조명) — 나머지는 이 파일의 샷 그대로.
    const ready = { ...shot('a2', 4), data: { ...shot('a2', 4).data, prompt: 'p', camera: {}, lighting: {} } } as unknown as DirectorNode
    const nodes = [shot('a1', 3), ready, shot('a3', 2), take('a1', 1, 'completed'), wired]
    useDirectorCanvasStore.setState({ projectId: 'proj-1', nodes })
    const label = remakeButton(nodes, { shotNodeId: 'n_a2', missing: 'failed' }, { showTakes: true, batch: null }, (key, params) => translate('en', key, params)).label
    const bodies: Array<Record<string, unknown>> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('/api/director/generate-video')) bodies.push(JSON.parse(String(init?.body)))
      return Response.json({ error: 'Not enough Takes', code: 'insufficient_takes' }, { status: 402 })
    })
    await useGlobalChatStore.getState().remakeMissingVideo('n_a2').catch(() => undefined)
    expect(bodies).toHaveLength(1)
    expect({ model: bodies[0].model, resolution: bodies[0].resolution, frameSource: bodies[0].frameSource }).toEqual({ model: 'seedance', resolution: '1080p', frameSource: 'manual' })
    expect(label).toBe(`Make again · ${takeCostForVideo('seedance', '1080p')} Takes`)
  })

  // 왜(검토 b 낮음 2): 이미지가 없어 보이는 샷도 화면이 낡았을 수 있다 — 그리드처럼 저장된 그림을 먼저 다시 읽어, 승인한 그림을 새로 그려 덮지 않는다.
  it('이미지가 없는 샷의 [영상 만들기]는 먼저 저장된 그림을 다시 읽고, 그림이 이미 있으면 이미지를 새로 만들지 않는다', async () => {
    const bare = { ...shot('a3', 2), data: { ...shot('a3', 2).data, storyboardImage: null } } as unknown as DirectorNode
    useDirectorCanvasStore.setState({ nodes: [shot('a1', 3), shot('a2', 4), bare, take('a1', 1, 'completed'), take('a2', 1, 'completed')] })
    const hydrate = vi.fn(async () => {
      useDirectorCanvasStore.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === 'n_a3' ? shot('a3', 2) : n)) }))
    })
    const makeImage = vi.fn(async () => undefined)
    const makeVideo = vi.fn(async () => 'v_new')
    useDirectorCanvasStore.setState({ hydrateFreshFromDb: hydrate, generateStoryboardImage: makeImage, generateVideoForShot: makeVideo } as never)
    await useGlobalChatStore.getState().remakeMissingVideo('n_a3')
    expect(hydrate).toHaveBeenCalledTimes(1)
    expect(makeImage).not.toHaveBeenCalled()
    expect(makeVideo).toHaveBeenCalledWith('n_a3', undefined)
  })

  // 왜(검토 b 보통 1): Writer 샷이 모두 영상이 있으면 Director 에서 더한 빈 샷이 있어도 창 없이 넘긴다(10/1).
  it('Writer 샷에 모두 영상이 있으면 Director 에서 더한 빈 샷이 있어도 창 없이 Editor로 넘어간다', async () => {
    const added = { id: 'n_new', type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: 'New Shot', writerShotId: null, durationSeconds: 5, storyboardImage: null } } as unknown as DirectorNode
    useDirectorCanvasStore.setState({ nodes: [...canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed'), take('a3', 1, 'completed')), added] })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(nav.handoffToStage).toHaveBeenCalledWith('editor')
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
    expect(makeVideo).toHaveBeenCalledWith('n_a2', { inheritFromVideoNodeId: 'v_a2_1' })
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
