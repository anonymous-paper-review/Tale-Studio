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
  board: { shotEditId: null, setShotEditId: () => {}, directorConfirmOpen: false, setDirectorConfirmOpen: () => {} },
  chatUi: { mentionedRefs: [] as string[] },
  chat: { offerSuggestion: () => {}, messages: [], messagesLoadedProjectId: null },
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

import { RealBoardView } from '@/features/storyboard/real-board-view'

const board = () => renderToStaticMarkup(createElement(RealBoardView))
/** 카드마다 (샷 id, 그림 종류, 기다림). */
const cards = (html: string) => [...html.matchAll(/data-shot-id="([^"]+)" data-picture="([^"]+)" data-wait="([^"]+)"/g)].map(([, id, picture, wait]) => ({ id, picture, wait }))

beforeEach(() => {
  data.writer.shots = [shot('a', 's1', conti('a')), shot('b', 's1', conti('b')), shot('c', 's2', null)]
  data.images = { projectId: 'p1', images: { b: real('b') }, load: async () => {} }
  data.jobs = []
  data.director = { realBatchBusy: false, realBatchCancelled: false, realBatchShotIds: null }
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

  // 왜(혼자 정한 것 — Director 카드와 같은 조건): [시작] 일괄이 맡은 샷 중 아직 보내지 않은 카드는 차례를 기다린다.
  it('[시작] 일괄이 도는 동안 실사가 없고 콘티가 있는 카드는 차례를 기다린다고 보인다', () => {
    data.director = { realBatchBusy: true, realBatchCancelled: false, realBatchShotIds: ['a'] }
    expect(cards(board()).map((c) => c.wait)).toEqual(['queued', 'none', 'none'])
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
    expect(actions).toMatch(/const start = \(\) => \{[\s\S]*startStoryboardReal\(projectId, view\.targets\)[\s\S]*onClick=\{start\}/)
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
