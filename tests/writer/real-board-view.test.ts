// Storyboard 실사 보기 보드가 씬마다 카드(실사 · 콘티)를 지금 보드처럼 그리고, 그리는 카드에만 기다림 · 진행 숫자를 보이며, 들어오기만 해서는 실사를 만들지 않는지 검사한다
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const conti = (id: string) => ({ url: `https://x/${id}-rough.png`, status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: `https://x/${id}-rough.png`, direction: 'd', end: 'e' } })
const real = (id: string) => ({ url: `https://x/${id}-real.png`, status: 'completed', generatedAt: 2, frames: { start: `https://x/${id}-real.png`, direction: 'rd', end: 're' } })
const shot = (shotId: string, sceneId: string, roughStoryboard: unknown) => ({
  shotId,
  sceneId,
  shotType: 'MS',
  actionDescription: `${shotId} 움직임`,
  characters: [],
  durationSeconds: 4,
  dialogueLines: [],
  camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
  lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
  roughStoryboard,
})

const data = vi.hoisted(() => ({
  project: { projectId: 'p1' },
  writer: {
    sceneManifest: { scenes: [{ sceneId: 's1', location: '', timeOfDay: '', narrativeSummary: '' }, { sceneId: 's2', location: '', timeOfDay: '', narrativeSummary: '' }], characters: [], locations: [] },
    shots: [] as unknown[],
    loadProject: async () => {},
  },
  images: { projectId: 'p1', images: {} as Record<string, unknown>, load: async () => {} },
  jobs: [] as unknown[],
  director: { realBatchBusy: false, realBatchCancelled: false, realBatchShotIds: null as string[] | null },
  board: { shotEditId: null, setShotEditId: () => {}, directorConfirmOpen: false, setDirectorConfirmOpen: () => {}, cardDrawing: {} as Record<string, string> },
  chatUi: { mentionedRefs: [] as string[] },
  chat: { offerSuggestion: () => {}, messages: [], messagesLoadedProjectId: null },
  roughFill: { projectId: null as string | null, pending: {} as Record<string, true>, running: false },
  status: null as Record<string, unknown> | null,
  restart: () => {},
}))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select(data.project) }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/lib/storyboard/real-images-store', () => ({
  useStoryboardRealImages: Object.assign((select: (s: unknown) => unknown) => select(data.images), { getState: () => data.images }),
}))
vi.mock('@/lib/generation-queue', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useActiveGenerationJobs: () => data.jobs }))
vi.mock('@/stores/director-store', () => ({ useDirectorCanvasStore: (select: (s: unknown) => unknown) => select(data.director) }))
vi.mock('@/features/writer/board-ui-store', () => ({
  useBoardUiStore: Object.assign((select: (s: unknown) => unknown) => select(data.board), { getState: () => data.board }),
}))
vi.mock('@/stores/chat-ui-store', () => ({ useChatUiStore: (select: (s: unknown) => unknown) => select(data.chatUi) }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: (select: (s: unknown) => unknown) => select(data.chat) }))
vi.mock('@/stores/artist-store', () => ({ useArtistStore: (select: (s: unknown) => unknown) => select({ characterAssets: [], worldAssets: [] }) }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ mode: 'off', failed: false, loading: false }) }))
vi.mock('@/features/storyboard/storyboard-header', () => ({ StoryboardHeader: () => null }))
vi.mock('@/features/storyboard/real-shot-dialog', () => ({ RealShotDialog: () => null }))
vi.mock('@/features/writer/storyboard-director-dialog', () => ({ StoryboardDirectorDialog: () => null }))
vi.mock('@/features/writer/storyboard-director', () => ({ handOverToDirector: vi.fn() }))
vi.mock('@/components/lumi/lumi', () => ({ Lumi: () => null }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: (select: (s: unknown) => unknown) => select({ locale: 'ko' }) }))
// 이어 그리기(서버 요청 · 효과)는 tests/writer/real-rough-fill 이 본다 — 여기서는 보드가 그리는 중을 어떻게 보이는지만.
vi.mock('@/features/storyboard/use-rough-fill', () => ({ useStoryboardRoughFill: () => {} }))
// Writer 실행 상태(씬 · 샷 나누기)는 값으로 꾸민다. 잠금 덮개 · [이어서 다시 시도] · 기다리는 카드는 브라우저에서만 그려지니 받은 값을 표시로 남긴다.
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: data.status, error: null, restart: data.restart }) }))
vi.mock('@/components/ai-busy-overlay', async () => {
  const { createElement } = await import('react')
  return {
    AiBusyOverlay: (props: { open: boolean; title: string; progressLabel?: string; lumi?: unknown }) =>
      props.open ? createElement('div', { 'data-busy-overlay': props.title, 'data-progress': props.progressLabel ?? '', 'data-lumi': props.lumi ? 'yes' : 'no' }) : null,
  }
})
vi.mock('@/components/layout/writer-resume-button', async () => {
  const { createElement } = await import('react')
  return { WriterResumeButton: (props: { projectId: string | null }) => createElement('button', { 'data-resume': props.projectId }, '이어서 다시 시도') }
})
vi.mock('@/components/feedback/stage-wait', async () => {
  const { createElement } = await import('react')
  return { StageWaitCard: (props: { stage: string }) => createElement('div', { 'data-stage-wait': props.stage }) }
})
// 이어 그리기 상태는 다른 상점처럼 값으로 꾸민다(프로젝트 거르기는 진짜 roughFillPendingOf).
vi.mock('@/lib/storyboard/rough-fill-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storyboard/rough-fill-store')>()
  return { ...actual, useRoughFillPending: (projectId: string | null) => actual.roughFillPendingOf(data.roughFill, projectId) }
})

import { RealBoardView } from '@/features/storyboard/real-board-view'

const board = () => renderToStaticMarkup(createElement(RealBoardView))
/** 카드마다 (샷 id, 그림 종류, 기다림). */
const cards = (html: string) => [...html.matchAll(/data-shot-id="([^"]+)" data-picture="([^"]+)" data-wait="([^"]+)"/g)].map(([, id, picture, wait]) => ({ id, picture, wait }))

beforeEach(() => {
  data.writer.shots = [shot('a', 's1', conti('a')), shot('b', 's1', conti('b')), shot('c', 's2', null)]
  data.images = { projectId: 'p1', images: { b: real('b') }, load: async () => {} }
  data.jobs = []
  data.director = { realBatchBusy: false, realBatchCancelled: false, realBatchShotIds: null }
  data.board.cardDrawing = {}
  data.roughFill = { projectId: null, pending: {}, running: false }
  data.status = null
})

describe('Storyboard 실사 보기 보드', () => {
  // 왜(오너 S1 · S2): 지금 보드처럼 씬마다 카드 — 실사가 있는 샷은 실사, 없으면 콘티, 콘티도 없으면 콘티 그림 없음.
  it('보드는 씬 순서대로 카드를 그리고 카드 그림은 실사 · 콘티 · 없음으로 나뉜다', () => {
    const html = board()
    expect(cards(html)).toEqual([
      { id: 'a', picture: 'conti', wait: 'none' },
      { id: 'b', picture: 'real', wait: 'none' },
      { id: 'c', picture: 'none', wait: 'none' },
    ])
    expect(html).toContain('씬 1 · 샷 1')
    expect(html).toContain('씬 2 · 샷 3')
  })

  // 왜(오너 S5 · O7): 화면을 막지 않고 그리는 카드에만 기다림 — 다른 카드는 그대로다.
  it('실사를 그리는 작업이 떠 있는 카드에만 기다림이 보이고 다른 카드는 그대로다', () => {
    data.jobs = [{ id: 'j1', kind: 'shot_storyboard', target: { writerShotId: 'b' } }]
    expect(cards(board()).map((c) => c.wait)).toEqual(['none', 'drawing', 'none'])
  })

  // 왜(W5 공유 규칙 cardDrawing · 리드 지시): 채팅이 맡긴 다시 그리기는 작업이 큐에 오르기 전에도 그 카드에 기다림 — 다른 프로젝트 표시는 보지 않는다.
  it('채팅이 맡긴 다시 그리기는 작업이 큐에 오르기 전에도 그 카드에만 기다림을 보인다', () => {
    data.board.cardDrawing = { b: 'p1', a: 'other-project' }
    expect(cards(board()).map((c) => c.wait)).toEqual(['none', 'drawing', 'none'])
  })

  // 왜(혼자 정한 것 — Director 카드와 같은 조건): [시작] 일괄이 맡은 샷 중 아직 보내지 않은 카드는 차례를 기다린다.
  it('[시작] 일괄이 도는 동안 실사가 없고 콘티가 있는 카드는 차례를 기다린다고 보인다', () => {
    data.director = { realBatchBusy: true, realBatchCancelled: false, realBatchShotIds: ['a'] }
    expect(cards(board()).map((c) => c.wait)).toEqual(['queued', 'none', 'none'])
  })

  // 왜(리드 2026-11-26 — Storyboard 가 빠진 콘티 그림을 이어 그린다): 콘티 그림을 그리는 동안 그 카드에만 기다림 — 보드 · 채팅은 잠그지 않는다(S5 · O7과 같은 결).
  it('콘티 그림을 그리는 작업이 떠 있는 카드에는 콘티 그림 기다림이 보이고, 진행 줄의 만드는 중에 든다', () => {
    data.jobs = [{ id: 'r1', kind: 'shot_rough_storyboard', target: { writerShotIds: ['c'] } }]
    const html = board()
    expect(cards(html).map((c) => c.wait)).toEqual(['none', 'none', 'rough'])
    expect(html.replace(/<!-- -->/g, '')).toContain('만드는 중 1')
  })

  // 왜(깜박임 방지): 이어 그리기가 보낸 샷은 작업이 큐에 오르기 전에도 기다림 — 다른 프로젝트의 표시는 보지 않는다.
  it('Storyboard 가 이어 그리기로 보낸 샷은 작업이 큐에 오르기 전에도 그 카드에 콘티 그림 기다림을 보인다', () => {
    data.roughFill = { projectId: 'p1', pending: { c: true }, running: true }
    expect(cards(board()).map((c) => c.wait)).toEqual(['none', 'none', 'rough'])
    data.roughFill = { projectId: 'other-project', pending: { c: true }, running: true }
    expect(cards(board()).map((c) => c.wait)).toEqual(['none', 'none', 'none'])
  })

  // 왜(리드 2026-11-26): Storyboard 화면이 열려 있는 동안 빠진 콘티 그림을 이어 그린다 — 보드가 보이는 샷(보드 순서)과 지금 그리는 샷을 이어 그리기에 넘긴다.
  it('Storyboard 보드는 열려 있는 동안 빠진 콘티 그림을 이어 그린다', () => {
    const view = readFileSync('src/features/storyboard/real-board-view.tsx', 'utf8')
    expect(view).toMatch(/useStoryboardRoughFill\(\{ projectId, shots: boardShotList, roughDrawing, activeJobs, locale \}\)/)
  })

  // 왜(혼자 정한 것 d): 지금 보드의 진행 줄 자리에 실사 기준 숫자.
  it('진행 줄에 보드 전체 · 실사 · 만드는 중 · 실사 없음 수가 보인다', () => {
    data.jobs = [{ id: 'j1', kind: 'storyboard_real_grid', target: { writerShotIds: ['a'] } }]
    const html = board().replace(/<!-- -->/g, '')
    expect(html).toContain('보드 전체 3샷')
    expect(html).toContain('실사 1')
    expect(html).toContain('만드는 중 1')
    expect(html).toContain('실사 없음 1')
  })

  // 왜(검토 2026-11-26 rev-flow): 예전 흐름 프로젝트에서 나누기 중에 Artist [완료하기]를 누르면 Storyboard 가 빈 보드에서 멈췄다 —
  //   나누는 동안은 예전 Storyboard 처럼 단계 · 진행이 보이는 잠금 표시(큰 Lumi)를 띄우고 빈 보드 안내는 보이지 않는다.
  it('씬 · 샷을 나누는 중에 Storyboard 를 열면 빈 보드 안내 대신 예전 Storyboard 와 같은 잠금 표시가 뜬다', () => {
    data.writer.shots = []
    data.status = { started: true, current_status: 'running', current_stage: 'decoupage', pipeline_completed: false, pipeline_failed: false, error: null }
    const html = board()
    expect(html).toContain('data-busy-overlay="Storyboard로 넘어가는 중이에요"')
    expect(html).toContain('data-progress="3/4 단계 · 50%"')
    expect(html).toContain('data-lumi="yes"')
    expect(html).not.toContain('아직 생성된 씬·샷이 없어요')
  })

  // 왜(검토 rev-flow · 예전 보드의 실패 안내): 나누기가 멈추면 까닭을 알리고 멈춘 자리부터 다시 하게 한다.
  it('나누기가 멈췄으면 빈 보드에 까닭과 [이어서 다시 시도]를 보인다', () => {
    data.writer.shots = []
    data.status = { started: true, current_status: 'failed', current_stage: 'decoupage', pipeline_completed: false, pipeline_failed: true, error: '연출 단계 응답이 비었어요' }
    const html = board()
    expect(html).toContain('생성이 중단됐어요: 연출 단계 응답이 비었어요')
    expect(html).toContain('data-resume="p1"')
    expect(html).not.toContain('data-busy-overlay')
  })

  // 왜(예전 보드와 같은 규칙): 나누기가 끝난 순간에는 저장된 샷이 아직 화면에 없다 — 다시 읽을 때까지 빈 보드 안내 대신 기다림.
  it('나누기가 끝나 씬 · 샷을 다시 읽는 동안에는 빈 보드 안내 대신 기다리는 카드를 보인다', () => {
    data.writer.shots = []
    data.status = { started: true, current_status: 'completed', current_stage: 'persistShots', pipeline_completed: true, pipeline_failed: false, error: null }
    const html = board()
    expect(html).toContain('data-stage-wait="writer"')
    expect(html).not.toContain('아직 생성된 씬·샷이 없어요')
  })

  // 왜(검토 rev-flow "나누기가 끝나도 다시 읽지 않아 비어 있다"): 이 화면을 보는 중에 나누기가 끝나면 씬 · 샷과 실사 그림을 다시 읽는다
  //   (30초 사물함은 낡음으로 표시 — 새 샷 행을 받게). 다시 나누기가 시작되면 다음 끝남에 또 읽는다.
  it('이 화면을 보는 중에 나누기가 끝나면 씬 · 샷과 실사 그림을 다시 읽는다', () => {
    const view = readFileSync('src/features/storyboard/real-board-view.tsx', 'utf8')
    expect(view).toMatch(/if \(!projectId \|\| !status\?\.pipeline_completed \|\| reloadedAfterSplitRef\.current\) return\s*reloadedAfterSplitRef\.current = true\s*void invalidateShots\(projectId\)/)
    expect(view).toMatch(/Promise\.allSettled\(\[loadProject\(\), useStoryboardRealImages\.getState\(\)\.load\(projectId, \{ fresh: true \}\)\]\)/)
    expect(view).toMatch(/if \(!splitRunning\) return\s*reloadedAfterSplitRef\.current = false/)
  })

  // 왜(정상 경로 고정): 씬 · 샷이 아직 없으면 빈 보드 안내.
  it('샷이 없으면 빈 보드 안내를 보인다', () => {
    data.writer.shots = []
    expect(board()).toContain('아직 생성된 씬·샷이 없어요')
  })

  // 왜(8/27 오너 "실사는 사람이 누를 때만"): 들어오기만 해서 실사를 만들면 콘티를 손볼 틈 없이 돈이 먼저 나간다.
  it('Storyboard 에 들어오기만 해서는 실사를 만들지 않는다 — 실사 일괄은 [시작]을 눌렀을 때만 시작한다', () => {
    const view = readFileSync('src/features/storyboard/real-board-view.tsx', 'utf8')
    expect(view).not.toMatch(/runRealBatch|startStoryboardReal|generate-storyboard/)
    const actions = readFileSync('src/features/storyboard/header-actions.tsx', 'utf8')
    expect(actions.match(/startStoryboardReal\(/g)).toHaveLength(1)
    expect(actions).toMatch(/const start = \(\) => \{[\s\S]*startStoryboardReal\(projectId, targets\)[\s\S]*onClick=\{start\}/)
  })

  // 왜(오너 O7 "다시 그리면 카드가 새 그림"): 실사 작업이 큐에서 빠지면 30초 사물함을 낡음으로 표시하고 실사 그림을 다시 읽는다.
  it('실사 작업이 큐에서 빠지면 실사 그림을 새로 읽어 카드가 새 그림을 보인다', () => {
    const view = readFileSync('src/features/storyboard/real-board-view.tsx', 'utf8')
    expect(view).toMatch(/const settled = computeSettledJobs\(prev, current\)\s*if \(settled\.length === 0\) return\s*void useStoryboardRealImages\s*\.getState\(\)\s*\.load\(projectId, \{ fresh: true \}\)/)
  })

  // 왜(G3 · D9 "모든 탭에서 같은 연출"): 씬 이름도 카드처럼 ⌘/Ctrl+클릭하면 "@씬 N"이 붙고 날아간다(그냥 누르면 접기).
  it('씬 이름을 ⌘/Ctrl+클릭하면 접지 않고 채팅에 "@씬 N"을 붙인다', () => {
    const view = readFileSync('src/features/storyboard/real-board-view.tsx', 'utf8')
    expect(view).toMatch(/onClickCapture=\{\(event\) => \{\s*mentionOnModifierClick\(event, sceneLabel\)/)
    expect(view).toContain('onPointerDownCapture={stopModifierPointerDown}')
  })
})
