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

import { editorHandoverView, handoverHeaderLine, proceedButtonLabel, remakeButton, remakeNotice, withRowNotice, withStartingRow } from '@/lib/director/editor-handover'
import type { GenerationJobObserver, GenerationJobReceipt } from '@/lib/generation-jobs-client'
import { takeCostForVideo, takeValuesShown } from '@/lib/billing/take-cost'
import { readFileSync } from 'node:fs'
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

  // 왜(검토 b 2차 낮음 1, 혼자 정한 것): 잔액을 못 읽으면 잔액 훅이 과금 꺼짐(off)처럼 보여 넘기기 창이 Take 값을 숨겼다 —
  //   D8 은 확인 창 없이 단추 값이 곧 동의인 자리라, 못 읽었으면 센 값을 그대로 보인다. 숨기는 것은 과금이 정말 꺼졌을 때뿐이다.
  it('Take 잔액을 읽지 못했으면 넘기기 창(D0 · D8)에 Take 값을 그대로 보인다 — 숨기는 것은 과금이 꺼졌을 때뿐이다', () => {
    expect(takeValuesShown({ mode: 'off', failed: true })).toBe(true)
    expect(takeValuesShown({ mode: 'off', failed: false })).toBe(false)
    expect(takeValuesShown({ mode: 'off' })).toBe(false)
    expect(takeValuesShown({ mode: 'shadow' })).toBe(true)
    expect(takeValuesShown({ mode: 'enforce', failed: false })).toBe(true)
    const nodes = canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed'))
    expect(remakeButton(nodes, failedRow, { showTakes: takeValuesShown({ mode: 'off', failed: true }), batch: null }, ko).label).toBe('다시 만들기 · 5 Take')
    // 두 창이 같은 판단을 쓴다.
    expect(readFileSync('src/components/handoff/editor-handover-dialog.tsx', 'utf8')).toMatch(/takeValuesShown\(useTakeBalance\(\)\)/)
    expect(readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')).toMatch(/takeValuesShown\(takeBalance\)/)
  })

  // 왜(검토 b 낮음 5): Take 과금이 꺼진 때는 노드의 Take 값도 숨긴다(#payments-phase-2) — 넘기기 창도 같은 규칙.
  it('Take 과금이 꺼져 있으면 Editor 넘기기 창의 만들기 단추에 Take 값을 적지 않는다', () => {
    const nodes = canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed'))
    expect(remakeButton(nodes, failedRow, { showTakes: false, batch: null }, ko).label).toBe('다시 만들기')
  })

  // 왜(검토 b 낮음 1): 이미지 · 영상 일괄이 도는 동안 줄 단추를 누르면 요청 · Take · 알림 없이 말없이 끝났다 — 끄고 까닭을 보인다(그리드와 같은 판단).
  //   (검토 b 2차 낮음 2) "영상 만드는 중"은 그 샷을 만드는 중으로 읽혔다 — 끈 단추에는 까닭(일괄이 끝나면 만들 수 있다)을 적는다.
  it('이미지 · 영상 일괄을 만드는 중이면 Editor 넘기기 창의 만들기 단추를 끄고 일괄이 끝나면 만들 수 있다고 보인다', () => {
    const nodes = canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed'))
    expect(remakeButton(nodes, failedRow, { showTakes: true, batch: 'images' }, ko)).toEqual({ label: '이미지 일괄이 끝나면 만들 수 있어요', disabled: true })
    expect(remakeButton(nodes, failedRow, { showTakes: true, batch: 'videos' }, ko)).toEqual({ label: '영상 일괄이 끝나면 만들 수 있어요', disabled: true })
    expect(remakeButton(nodes, failedRow, { showTakes: true, batch: null }, ko).disabled).toBe(false)
  })

  // 왜(검토 b 낮음 3): 창을 연 채 다시 만들기가 다 끝나면 "영상 없는 샷 0개 빼고 넘기기"가 됐다 — 빠질 샷이 없으면 시안 D8 의 "Editor로 넘기기 · 컷 N · 약 N초".
  it('넘기기 창이 열린 채 빠질 샷이 없어지면 넘기기 단추는 "Editor로 넘기기 · 컷 N · 약 N초"가 된다', () => {
    const done = editorHandoverView(canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed'), take('a3', 1, 'completed')), names)
    expect(proceedButtonLabel(done, ko)).toBe('Editor로 넘기기 · 컷 3 · 약\u00a09초')
    const oneLeft = editorHandoverView(canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed')), names)
    expect(proceedButtonLabel(oneLeft, ko)).toBe('Scene 1 · Shot 3 빼고 넘기기 · 컷 2 · 약\u00a07초')
  })

  // 왜(리드 2026-11-14 · export 확인): 창의 길이는 샷 계획 길이의 합이고, Editor 는 클립마다 실제 영상 파일 길이로 줄일 수 있다 — 사실대로 어림으로 보인다.
  it('Editor 넘기기 창의 합계 길이는 "약 N초"로 보인다', () => {
    const view = editorHandoverView(canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed')), names)
    expect(handoverHeaderLine(view, ko)).toBe('영상 2/3 · 약\u00a07초 · 영상이 없는 샷은 타임라인에 빈 칸으로 들어가지 않아요.')
    expect(handoverHeaderLine(view, (key, params) => translate('en', key, params))).toBe('2/3 videos · about 7s · Shots without video do not go into the timeline as empty slots.')
  })

  // 왜(리드 11/14, entry 탐침): 창의 '누른 줄'이 한 칸이라, 먼저 누른 줄의 다시 만들기가 끝나면 나중에 누른 다른 줄의 스피너까지 꺼졌다 —
  //   그 줄이 아직 이미지를 그리는 중(접수 전)이면 단추가 다시 켜졌다. 이 저장소엔 화면을 눌러 볼 시험 도구가 없어 줄 모음 함수와 창의 쓰임을 본다.
  it('먼저 누른 줄이 끝나도 나중에 누른 다른 줄의 스피너는 꺼지지 않는다', () => {
    let rows: ReadonlySet<string> = new Set()
    rows = withStartingRow(rows, 'n_a2', true)
    rows = withStartingRow(rows, 'n_a3', true)
    rows = withStartingRow(rows, 'n_a2', false)
    expect([...rows]).toEqual(['n_a3'])
    const dialog = readFileSync('src/components/handoff/editor-handover-dialog.tsx', 'utf8')
    expect(dialog).toMatch(/withStartingRow\(current, row\.shotNodeId, false\)/)
    expect(dialog).toMatch(/const busy = starting\.has\(row\.shotNodeId\)/)
  })

  // 왜(검토 b 낮음, 리드 11/14): 까닭 줄도 창에 한 칸이라, A 가 까닭으로 끝난 뒤 B 가 다른 까닭으로 끝나면 A 것이 사라졌고,
  //   다른 줄을 누르는 순간에도 앞 줄 까닭이 지워졌다. 스피너처럼 줄마다 둔다 — 그 줄을 다시 누를 때만 그 줄 것을 지운다.
  it('한 줄의 까닭은 다른 줄을 누르거나 다른 줄이 끝나도 남는다', () => {
    const unknown = remakeNotice('takes_unknown', ko)!
    const limit = remakeNotice('video_limit', ko)!
    let notices: ReadonlyMap<string, string> = new Map()
    notices = withRowNotice(notices, 'n_a2', unknown) // 2번 줄이 까닭으로 끝남
    notices = withRowNotice(notices, 'n_a3', null) // 3번 줄을 누름
    notices = withRowNotice(notices, 'n_a3', limit) // 3번 줄이 다른 까닭으로 끝남
    expect([...notices]).toEqual([['n_a2', unknown], ['n_a3', limit]])
    notices = withRowNotice(notices, 'n_a2', null) // 2번 줄을 다시 누르면 2번 줄 것만 지운다
    expect([...notices]).toEqual([['n_a3', limit]])
    const dialog = readFileSync('src/components/handoff/editor-handover-dialog.tsx', 'utf8')
    expect(dialog).toMatch(/withRowNotice\(current, row\.shotNodeId, null\)/)
    expect(dialog).toMatch(/withRowNotice\(current, row\.shotNodeId, message\)/)
    expect(dialog).toMatch(/const rowNotice = notices\.get\(row\.shotNodeId\)/)
  })

  // 왜(검토 a 낮음, 리드 11/14): 넘기기 창 부품은 늘 붙어 있고 open 만 바뀌어, 까닭 모음이 닫기 · 다시 열기를 건너 살아남았다 —
  //   나중에 다시 열면 그새 상황이 바뀌었어도 옛 까닭("동시에 만드는 영상 수가 다 찼어요" 등)이 줄 아래 그대로 보였다.
  //   화면을 눌러 볼 시험 도구가 없어 창의 쓰임(소스 글자)을 본다. 돌기 표시는 다시 만들기가 끝날 때(finally) 비우니 그대로다.
  it('넘기기 창을 닫았다 다시 열면 앞에서 남은 까닭 줄은 모두 지워진다', () => {
    const host = readFileSync('src/components/handoff/handoff-confirm-dialogs.tsx', 'utf8')
    expect(host).toMatch(/<EditorHandoverDialog open=\{/)
    const dialog = readFileSync('src/components/handoff/editor-handover-dialog.tsx', 'utf8')
    expect(dialog).toMatch(/useEffect\(\(\) => \{\n\s*setNotices\(new Map\(\)\)\n\s*\}, \[open\]\)/)
  })
})

const userLines = () => useGlobalChatStore.getState().messages.filter((m) => m.role === 'user').map((m) => m.content)

describe('Editor 넘기기 창의 까닭 글', () => {
  const ko = (key: string, params?: Record<string, string | number>) => translate('ko', key, params)

  // 왜(검토 b 2차 낮음 3): [다시 만들기]가 일괄 중 · 그 샷 이미지를 만드는 중이면 말없이 끝났다 — 시작하지 못한 까닭을 창이 그 줄에 보인다.
  it('[다시 만들기]를 시작하지 못하면 창이 그 까닭을 보인다', () => {
    expect(remakeNotice('image_batch', ko)).toBe('이미지 일괄이 끝나면 만들 수 있어요')
    expect(remakeNotice('video_batch', ko)).toBe('영상 일괄이 끝나면 만들 수 있어요')
    expect(remakeNotice('image_running', ko)).toBe('이 샷 이미지를 만드는 중이에요. 다 되면 영상을 만들 수 있어요.')
    expect(remakeNotice('video_running', ko)).toBe('이 샷 영상을 이미 만드는 중이에요.')
    expect(remakeNotice('image_failed', ko)).toBe('이미지 생성에 실패했습니다.')
    expect(remakeNotice('not_started', ko)).toBe('영상을 시작하지 못했어요. 잠시 뒤 다시 해 보세요.')
    expect(remakeNotice('no_window', ko)).toBeNull()
  })

  // 왜(리드 2026-11-14): 좁은 화면에서 넘기기 단추가 "… 약" / "33초"로 갈렸다 — "약"과 숫자 사이는 줄이 안 바뀌는 빈칸으로 쓴다.
  it('한국어 넘기기 창의 "약"과 숫자 사이는 줄이 바뀌지 않는 빈칸이다', () => {
    const view = editorHandoverView(canvas(take('a1', 1, 'completed')), names)
    for (const text of [handoverHeaderLine(view, ko), proceedButtonLabel(view, ko)]) {
      expect(text).toContain('약\u00a0')
      expect(text).not.toContain('약 ')
    }
  })
})

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
  // 영상 요청이 접수된 것처럼 — 서버가 2xx 로 받아 jobId 를 준 알림을 보내고 새 Take id 를 돌려준다(D8 은 접수로 시작을 센다, 리드 11/14).
  const acceptedVideo = () =>
    vi.fn(async (_shotNodeId: string, options?: { onJob?: GenerationJobObserver }) => {
      options?.onJob?.({ jobId: 'job-1', status: 'queued', httpStatus: 202 })
      return 'v_new'
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
    expect(makeVideo).toHaveBeenCalledWith('n_a2', { inheritFromVideoNodeId: 'v_a2_1', onJob: expect.any(Function) })
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
    useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
    const bodies: Array<Record<string, unknown>> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      // [다시 만들기]는 시작 전에 잔액을 다시 읽는다 — 읽히는 잔액을 둔다(준비).
      if (String(input).includes('/api/billing/take-balance')) return Response.json({ balance: 40, mode: 'enforce' })
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
    useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
    await useGlobalChatStore.getState().remakeMissingVideo('n_a3')
    expect(hydrate).toHaveBeenCalledTimes(1)
    expect(makeImage).not.toHaveBeenCalled()
    expect(makeVideo).toHaveBeenCalledWith('n_a3', { onJob: expect.any(Function) })
  })

  // 왜(검토 b 보통 1): Writer 샷이 모두 영상이 있으면 Director 에서 더한 빈 샷이 있어도 창 없이 넘긴다(10/1).
  it('Writer 샷에 모두 영상이 있으면 Director 에서 더한 빈 샷이 있어도 창 없이 Editor로 넘어간다', async () => {
    const added = { id: 'n_new', type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: 'New Shot', writerShotId: null, durationSeconds: 5, storyboardImage: null } } as unknown as DirectorNode
    useDirectorCanvasStore.setState({ nodes: [...canvas(take('a1', 1, 'completed'), take('a2', 1, 'completed'), take('a3', 1, 'completed')), added] })
    await useGlobalChatStore.getState().requestNextStep()
    expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
    expect(nav.handoffToStage).toHaveBeenCalledWith('editor')
  })

  // 왜(검토 b 2차 낮음 3): 일괄 중이거나 그 샷 이미지를 이미 만드는 중이면 [다시 만들기]가 요청 · Take · 알림 없이 말없이 끝났다 —
  //   시작했는지, 못 했으면 왜인지 돌려주어 창이 보이게 한다.
  it('일괄 중이거나 그 샷 이미지를 만드는 중이면 [다시 만들기]는 시작하지 않고 그 까닭을 돌려준다', async () => {
    const makeVideo = acceptedVideo()
    const makeImage = vi.fn(async () => undefined)
    useDirectorCanvasStore.setState({ generateVideoForShot: makeVideo, generateStoryboardImage: makeImage, hydrateFreshFromDb: vi.fn(async () => undefined) } as never)
    useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
    const remake = (id: string) => useGlobalChatStore.getState().remakeMissingVideo(id)
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed')), realBatchBusy: true, videoBatchBusy: false })
    await expect(remake('n_a2')).resolves.toEqual({ started: false, reason: 'image_batch' })
    useDirectorCanvasStore.setState({ realBatchBusy: false, videoBatchBusy: true })
    await expect(remake('n_a2')).resolves.toEqual({ started: false, reason: 'video_batch' })
    const drawing = { ...shot('a3', 2), data: { ...shot('a3', 2).data, storyboardImage: { status: 'generating', url: null } } } as unknown as DirectorNode
    useDirectorCanvasStore.setState({ videoBatchBusy: false, nodes: [shot('a1', 3), shot('a2', 4), drawing, take('a1', 1, 'completed'), take('a2', 1, 'failed')] })
    await expect(remake('n_a3')).resolves.toEqual({ started: false, reason: 'image_running' })
    expect(makeImage).not.toHaveBeenCalled()
    expect(makeVideo).not.toHaveBeenCalled()
    // 정상 경로 — 시작했다고 돌려준다.
    await expect(remake('n_a2')).resolves.toEqual({ started: true })
    expect(makeVideo).toHaveBeenCalledTimes(1)
  })

  // 왜(검토 b 2차 낮음 1, 혼자 정한 것): 잔액을 못 읽은 채 Take 를 쓰는 [다시 만들기]를 시작하지 않는다 — Lumi 채팅 영상 부탁과 같은 판단이다
  //   (board "Take 를 확인하지 못해 시작하지 않았어요"). 누를 때마다 잔액을 다시 읽어, 읽히면 그대로 시작한다.
  it('Take 잔액을 읽지 못하면 [다시 만들기]는 시작하지 않고 그 까닭을 그 줄에 보이고, 다시 눌러 잔액이 읽히면 시작한다', async () => {
    const makeVideo = acceptedVideo()
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed')), generateVideoForShot: makeVideo } as never)
    useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
    let balanceUp = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/api/billing/take-balance')
        ? balanceUp ? Response.json({ balance: 40, mode: 'enforce' }) : new Response('down', { status: 503 })
        : Response.json({ ok: true }),
    )
    await expect(useGlobalChatStore.getState().remakeMissingVideo('n_a2')).resolves.toEqual({ started: false, reason: 'takes_unknown' })
    expect(makeVideo).not.toHaveBeenCalled()
    expect(remakeNotice('takes_unknown', (key, params) => translate('ko', key, params))).toBe('Take 를 확인하지 못해 시작하지 않았어요. 잠시 뒤 다시 눌러 주세요.')
    expect(remakeNotice('takes_unknown', (key, params) => translate('en', key, params))).toBe("I couldn't check your Takes, so I didn't start. Please try again in a moment.")
    balanceUp = true
    await expect(useGlobalChatStore.getState().remakeMissingVideo('n_a2')).resolves.toEqual({ started: true })
    expect(makeVideo).toHaveBeenCalledTimes(1)
  })

  // 왜(리드 11/14, entry 탐침): 다시 만들기는 영상이 끝날 때까지(5초마다 확인, 최대 10분) 돌아오지 않았다 — 창의 [다시 만들기] 스피너가
  //   영상이 끝날 때까지 돌고 '시작했다'는 결과도 끝에서야 왔다. 서버가 2xx 로 받아 jobId 를 준 때(접수)가 시작이다.
  it('Editor 넘기기 창의 [다시 만들기]는 영상 요청이 접수되면 영상이 끝나기를 기다리지 않고 시작했다고 돌려준다', async () => {
    // 접수 알림은 바로 오고, 영상은 끝나지 않는다.
    const makeVideo = vi.fn((_shotNodeId: string, options?: { onJob?: GenerationJobObserver }) => {
      options?.onJob?.({ jobId: 'job-1', status: 'queued', httpStatus: 202 })
      return new Promise<string | null>(() => {})
    })
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed')), generateVideoForShot: makeVideo } as never)
    useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
    const waited = new Promise((resolve) => setTimeout(() => resolve('영상이 끝나기를 기다렸다'), 1_000))
    await expect(Promise.race([useGlobalChatStore.getState().remakeMissingVideo('n_a2'), waited])).resolves.toEqual({ started: true })
    expect(makeVideo).toHaveBeenCalledTimes(1)
  })

  // 왜(리드 11/14 — 시작은 서버가 2xx 로 받아 jobId 를 준 때뿐): 서버 오류 · 연결 끊김에도 다시 만들기는 실패로 표시한 새 Take 의 id 를
  //   돌려준다 — 그 id 를 시작으로 세면 창이 아무 말 없이 줄만 '만들다 실패'로 바꿨다. 새 Take 가 없으면(id 없음) 지금처럼 시작하지 못한 것이다.
  it('Editor 넘기기 창의 [다시 만들기]는 영상 요청이 접수되지 않고 실패로 끝나면(서버 오류 · 연결 끊김 · 새 Take 없음) 시작하지 못했다고 그 까닭을 돌려준다', async () => {
    const endsFailed = (error: string) =>
      vi.fn(async (_shotNodeId: string, options?: { onJob?: GenerationJobObserver }) => {
        const failedTake = take('a2', 2, 'failed')
        useDirectorCanvasStore.setState((s) => ({ nodes: [...s.nodes, failedTake] }))
        options?.onJob?.({ jobId: null, status: 'failed', error })
        return failedTake.id
      })
    const noTake = vi.fn(async () => null)
    useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
    for (const makeVideo of [endsFailed('HTTP 500'), endsFailed('Failed to fetch'), noTake]) {
      useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed')), generateVideoForShot: makeVideo } as never)
      await expect(useGlobalChatStore.getState().remakeMissingVideo('n_a2')).resolves.toEqual({ started: false, reason: 'not_started' })
    }
  })

  // 왜(검토 b 참고 1): 500 + jobId · failed 뒤 다시 읽기마저 실패하면 이번에 돌려받은 Take 가 status generating(마지막 시도는 failed)으로
  //   남는다 — 그 Take 때문에 "이 샷 영상을 이미 만드는 중이에요"가 나왔다. 이번 Take 는 이번 결과로만 본다.
  it("이번 다시 만들기가 실패로 끝났으면 그 Take 때문에 '이미 만드는 중'이라고 말하지 않는다", async () => {
    const makeVideo = vi.fn(async (_shotNodeId: string, options?: { onJob?: GenerationJobObserver }) => {
      const stale = take('a2', 2, 'generating', { lastAttemptStatus: 'failed' })
      useDirectorCanvasStore.setState((s) => ({ nodes: [...s.nodes, stale] }))
      options?.onJob?.({ jobId: 'job-1', status: 'failed', httpStatus: 500, error: 'HTTP 500' })
      return stale.id
    })
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed')), generateVideoForShot: makeVideo } as never)
    useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
    await expect(useGlobalChatStore.getState().remakeMissingVideo('n_a2')).resolves.toEqual({ started: false, reason: 'not_started' })
  })

  // 왜(리드 11/14): 2xx 가 아닌 답에 jobId · queued 가 실려 오면(503 결과 모름 · 400 등) 접수로 세지 않지만, 새 Take 는 보드에서 만드는 중으로
  //   남는다 — 그 줄 글은 상점에서 나오므로 '시작하지 못했어요'를 붙이면 '만드는 중'인 줄과 어긋난다(Lumi 의 "아직 몰라요"와 같은 판단).
  it('Editor 넘기기 창의 [다시 만들기]는 서버 답이 모호하면(접수 알림 없이 새 Take 가 보드에서 만드는 중) 그 줄은 만드는 중으로 두고 시작하지 못했다고 말하지 않는다', async () => {
    const ambiguous = (receipt: GenerationJobReceipt) =>
      vi.fn(async (_shotNodeId: string, options?: { onJob?: GenerationJobObserver }) => {
        const making = take('a2', 2, 'generating')
        useDirectorCanvasStore.setState((s) => ({ nodes: [...s.nodes, making] }))
        options?.onJob?.(receipt)
        return making.id
      })
    const receipts: GenerationJobReceipt[] = [
      { jobId: 'job-1', status: 'queued', httpStatus: 503 }, // 제출 결과 모름
      { jobId: 'job-1', status: 'queued', httpStatus: 400 }, // 거절 꼴인데 몸에 jobId · queued 가 실려 왔다
    ]
    useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
    for (const receipt of receipts) {
      useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a2', 1, 'failed')), generateVideoForShot: ambiguous(receipt) } as never)
      await expect(useGlobalChatStore.getState().remakeMissingVideo('n_a2')).resolves.toEqual({ started: true })
      const row = editorHandoverView(useDirectorCanvasStore.getState().nodes, names).shots.find((r) => r.shotNodeId === 'n_a2')
      expect(row?.missing).toBe('generating')
    }
  })

  // 왜(리드 11/14, entry 브라우저 확인): [바꾸기]가 샷 팝업(openPopup)으로 열어, 노드 보기에서는 창만 닫히고 아무것도 열리지 않았고
  //   (노드 보기의 팝업은 씬만) 스토리보드 보기에서는 이미지 탭으로 열렸다. Take 는 영상 탭에서 고른다 — 두 보기 모두 샷 상세(detailNodeId · detailTab)를 따른다.
  it('넘기기 창의 [바꾸기]는 창을 닫고 그 샷 상세를 영상 탭(Take 고르기)으로 연다 — 노드 보기 · 스토리보드 보기 모두', () => {
    const { viewMode } = useDirectorCanvasStore.getState()
    try {
      for (const view of ['node', 'storyboard'] as const) {
        useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed'), take('a3', 1, 'completed')), viewMode: view, popupNodeId: null, detailNodeId: null })
        useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
        useGlobalChatStore.getState().changeHandoverTake('n_a1')
        expect(useGlobalChatStore.getState().handoffConfirm).toBeNull()
        expect(useDirectorCanvasStore.getState()).toMatchObject({ viewMode: view, detailNodeId: 'n_a1', detailTab: 'video', popupNodeId: null })
      }
    } finally {
      useDirectorCanvasStore.setState({ viewMode, popupNodeId: null, detailNodeId: null })
    }
    const dialog = readFileSync('src/components/handoff/editor-handover-dialog.tsx', 'utf8')
    expect(dialog).toMatch(/changeTake\(row\.shotNodeId\)/)
    expect(dialog).not.toMatch(/openPopup\(/)
  })

  // 왜(검토 a 참고, 리드 11/14): 노드 보기에서 그 샷 상세가 이미 열려 있으면 openShotDetail 이 같은 샷 · 같은 탭을 다시 넣어 상점 값이 그대로라,
  //   왼쪽 패널이 사람이 안에서 바꿔 둔 이미지 탭에 머물렀다. 열 때마다 여는 차례를 올리고, 상세는 그 차례가 바뀔 때 탭만 맞춘다(다시 붙이지 않는다).
  //   탭은 상세 안의 화면 상태라 화면 시험 도구 없이 볼 수 없어 — 상점의 여는 차례와 탭을 맞추는 효과(소스 글자)를 본다.
  it('노드 보기에서 그 샷 상세가 이미 열려 사람이 안에서 이미지 탭으로 바꿔 두었어도, [바꾸기] · ⤢ 는 영상 탭(⤢ 는 그 버튼의 탭)으로 다시 연다', () => {
    const { viewMode } = useDirectorCanvasStore.getState()
    const openWindow = () => useGlobalChatStore.setState({ handoffConfirm: { kind: 'editorMissingVideos', projectId: 'proj-1', via: 'button' } })
    try {
      useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed')), viewMode: 'node', detailNodeId: null })
      openWindow()
      useGlobalChatStore.getState().changeHandoverTake('n_a1')
      const first = useDirectorCanvasStore.getState().detailOpenSeq
      // 그 상세가 열린 채로(사람이 안에서 이미지 탭으로 바꿈 — 상세 안의 화면 상태) 다시 창을 열고 [바꾸기]
      openWindow()
      useGlobalChatStore.getState().changeHandoverTake('n_a1')
      expect(useDirectorCanvasStore.getState()).toMatchObject({ detailNodeId: 'n_a1', detailTab: 'video', detailOpenSeq: first + 1 })
      // ⤢ 도 같은 상세를 다시 열면 차례가 오른다 — 그 버튼의 탭으로.
      useDirectorCanvasStore.getState().openShotDetail('n_a1', 'image')
      expect(useDirectorCanvasStore.getState()).toMatchObject({ detailNodeId: 'n_a1', detailTab: 'image', detailOpenSeq: first + 2 })
    } finally {
      useDirectorCanvasStore.setState({ viewMode, detailNodeId: null })
    }
    const panel = readFileSync('src/features/director/canvas-panels/DirectorDetailPanel.tsx', 'utf8')
    expect(panel).toMatch(/openSeq=\{detailNodeId \? detailOpenSeq : undefined\}/)
    const detail = readFileSync('src/features/director/shot-detail/director-shot-detail.tsx', 'utf8')
    expect(detail).toMatch(/if \(openSeq !== undefined\) setTab\(initialTab\)[\s\S]{0,200}\}, \[openSeq\]\)/)
  })

  // 왜(리드 11/14): 2d646380 은 열 때마다 패널을 새로 붙여(key 에 여는 차례), 상세 안에서 보내기 전에 적던 글(이미지 · 영상 고치기 칸, 화면에만 있음)이
  //   탭이 그대로여도 지워졌다. 패널은 노드 기준으로 붙어 있고, 여는 차례가 바뀔 때 탭만 맞춘다 — 탭이 바뀌면 떠난 탭의 글이 지워지는 것은
  //   손으로 탭을 바꿀 때와 같은 예전부터의 동작이다. 화면 시험 도구가 없어 패널 · 상세의 쓰임(소스 글자)을 본다.
  it('노드 보기에서 그 샷 상세가 이미 열려 있으면 [바꾸기] · ⤢ 는 패널을 새로 붙이지 않고 탭만 바꾼다 — 탭이 그대로면 적던 글도 남는다', () => {
    const panel = readFileSync('src/features/director/canvas-panels/DirectorDetailPanel.tsx', 'utf8')
    // 패널은 노드 기준으로만 붙는다 — 여는 차례 · 탭이 바뀌어도 다시 붙지 않는다.
    expect(panel).toMatch(/<DirectorShotDetail\s+key=\{node\.id\}/)
    expect(panel).not.toMatch(/key=\{[^\n]*detailOpenSeq/)
    // 상세는 여는 차례가 바뀔 때 탭만 고른 탭으로 맞춘다.
    expect(panel).toMatch(/openSeq=\{detailNodeId \? detailOpenSeq : undefined\}/)
    const detail = readFileSync('src/features/director/shot-detail/director-shot-detail.tsx', 'utf8')
    expect(detail).toMatch(/if \(openSeq !== undefined\) setTab\(initialTab\)[\s\S]{0,200}\}, \[openSeq\]\)/)
  })

  // 왜(혼자 정한 것): 채팅으로 넘겨 달라고 해도 같은 판단을 탄다 — Director 준비 창이 채팅에서도 열리는 것과 같게.
  it('채팅으로 Editor로 넘겨 달라고 해도 영상이 없는 샷이 있으면 같은 창을 연다', async () => {
    useDirectorCanvasStore.setState({ nodes: canvas(take('a1', 1, 'completed')) })
    await useGlobalChatStore.getState().sendMessage('Editor로 넘겨줘')
    expect(useGlobalChatStore.getState().handoffConfirm).toMatchObject({ kind: 'editorMissingVideos', via: 'chat' })
    expect(nav.handoffToStage).not.toHaveBeenCalled()
  })
})
