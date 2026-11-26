// Storyboard 머리 오른쪽 [시작] · [멈추기] · [다음: Director로 →]가 화면 상태에 따라 바뀌고 크림 단추가 하나인지, 콘티 그림 없는 샷을 빼고 시작할 때 알리는지 검사한다
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const conti = (id: string) => ({ url: `https://x/${id}.png`, status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'a', direction: 'b', end: 'c' } })
const real = { url: 'https://x/real.png', status: 'completed', generatedAt: 2, frames: { start: 'r1', direction: 'r2', end: 'r3' } }

const data = vi.hoisted(() => ({
  project: { projectId: 'p1' },
  writer: {
    sceneManifest: { scenes: [{ sceneId: 's1' }], characters: [], locations: [] },
    shots: [] as Array<Record<string, unknown>>,
  },
  images: { projectId: 'p1', images: {} as Record<string, unknown> },
  director: { realBatchBusy: false, realBatchCancelled: false, realBatchShotIds: null as string[] | null },
  chat: { loading: false, directorHandoff: null },
  board: { setDirectorConfirmOpen: () => {} },
  jobs: [] as unknown[],
  roughFill: { projectId: null as string | null, pending: {} as Record<string, true>, running: false },
}))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select(data.project) }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/lib/storyboard/real-images-store', () => ({ useStoryboardRealImages: (select: (s: unknown) => unknown) => select(data.images) }))
vi.mock('@/stores/director-store', () => ({ useDirectorCanvasStore: (select: (s: unknown) => unknown) => select(data.director) }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: (select: (s: unknown) => unknown) => select(data.chat) }))
vi.mock('@/features/writer/board-ui-store', () => ({ useBoardUiStore: (select: (s: unknown) => unknown) => select(data.board) }))
// 단추 모습만 본다 — 일괄 러너는 tests/writer/real-start · real-start-runner 가 본다.
vi.mock('@/lib/storyboard/start-real', () => ({ startStoryboardReal: vi.fn(), stopStoryboardReal: vi.fn() }))
vi.mock('@/lib/generation-queue', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useActiveGenerationJobs: () => data.jobs }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

// 이어 그리기 상태는 다른 상점처럼 값으로 꾸민다(프로젝트 거르기는 진짜 roughFillPendingOf).
vi.mock('@/lib/storyboard/rough-fill-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storyboard/rough-fill-store')>()
  return { ...actual, useRoughFillPending: (projectId: string | null) => actual.roughFillPendingOf(data.roughFill, projectId) }
})

import { StoryboardHeaderActions } from '@/features/storyboard/header-actions'
import { noContiNotice } from '@/lib/storyboard/real-board'

/** 머리 단추들 — 단추마다 data-testid 와 data-variant. */
function buttons(): Array<{ id: string; variant: string; disabled: boolean; text: string }> {
  const html = renderToStaticMarkup(createElement(StoryboardHeaderActions))
  return [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attrs, inner]) => ({
    id: /data-testid="([^"]+)"/.exec(attrs)?.[1] ?? '',
    variant: /data-variant="([^"]+)"/.exec(attrs)?.[1] ?? '',
    disabled: /\sdisabled=""/.test(attrs),
    text: inner.replace(/<[^>]+>/g, ''),
  }))
}

beforeEach(() => {
  data.writer.shots = [
    { shotId: 'a', sceneId: 's1', durationSeconds: 4, roughStoryboard: conti('a') },
    { shotId: 'b', sceneId: 's1', durationSeconds: 3, roughStoryboard: conti('b') },
  ]
  data.images = { projectId: 'p1', images: {} }
  data.director = { realBatchBusy: false, realBatchCancelled: false, realBatchShotIds: null }
  data.jobs = []
  data.roughFill = { projectId: null, pending: {}, running: false }
})

describe('Storyboard 머리 단추', () => {
  // 왜(오너 S2 · 혼자 정한 것 b, design §1 규칙 2 "크림은 화면에 하나"): 실사로 바꿀 콘티가 있으면 [시작]이 지금 할 일이다.
  it('실사 그림이 없는 샷이 있으면 머리에 크림 [시작]이 있고 [다음: Director로]는 보조 단추다', () => {
    const [start, next] = buttons()
    expect(start).toMatchObject({ id: 'storyboard-start', variant: 'default', text: '시작' })
    expect(next).toMatchObject({ id: 'storyboard-next-director', variant: 'secondary' })
  })

  // 왜(혼자 정한 것 b): 실사가 다 있으면 남은 일은 Director 로 가는 것뿐이다.
  it('모든 샷에 실사 그림이 있으면 [시작]이 없고 [다음: Director로]가 크림 단추다', () => {
    data.images = { projectId: 'p1', images: { a: real, b: real } }
    const list = buttons()
    expect(list.map((b) => b.id)).toEqual(['storyboard-next-director'])
    expect(list[0].variant).toBe('default')
  })

  // 왜(혼자 정한 것 c — Director [모두 멈추기]와 같은 약속): 도는 동안 같은 자리에서 멈출 수 있다.
  it('실사 일괄이 도는 동안 [시작] 자리에 [멈추기]가 보인다', () => {
    data.director = { realBatchBusy: true, realBatchCancelled: false, realBatchShotIds: ['a', 'b'] }
    const [stop, next] = buttons()
    expect(stop).toMatchObject({ id: 'storyboard-stop', variant: 'secondary', text: '멈추기', disabled: false })
    expect(next.variant).toBe('default')
  })

  // 왜: 멈춘 판이 보낸 장을 정리하는 동안 다시 누르면 같은 멈춤을 또 보낸다 — 꺼 두고 무엇을 하는지 말한다.
  it('[멈추기]를 누른 뒤 정리하는 동안은 "중단하는 중"으로 꺼져 있다', () => {
    data.director = { realBatchBusy: true, realBatchCancelled: true, realBatchShotIds: null }
    expect(buttons()[0]).toMatchObject({ id: 'storyboard-stop', text: '중단하는 중', disabled: true })
  })

  // 왜(오너 S2): [시작]은 화면이 센 샷으로 Storyboard 일괄을 시작한다 — Director 와 같은 길(lib/storyboard/start-real).
  it('[시작]을 누르면 화면이 센 샷으로 Storyboard 일괄을 시작하고, 빠지는 샷이 있으면 먼저 알린다', () => {
    const src = readFileSync('src/features/storyboard/header-actions.tsx', 'utf8')
    expect(src).toMatch(/const notice = noContiNotice\(locale, view\.noConti\.map\(nameOf\)\)\s*if \(notice\) toast\.info\(notice\)\s*const targets = view\.targets\s*void import\('@\/lib\/storyboard\/start-real'\)\.then\(\(\{ startStoryboardReal \}\) => startStoryboardReal\(projectId, targets\)\)/)
  })
})

describe('콘티 그림을 그리는 중인 샷', () => {
  // 왜(리드 2026-11-26 "그리는 중인 샷은 (f)처럼 빼고 이름을 알린다"): 바뀌는 중인 콘티로 실사를 만들면 다시 만들어야 한다 —
  //   [시작]이 세는 수에서 빼고(이어 그리기가 보낸 샷 · 다른 곳에서 그리는 샷 모두), 누르면 그 이름을 먼저 알린다.
  it('[시작]은 콘티 그림을 그리는 중인 샷을 세지 않고, 누르면 그 샷 이름을 먼저 알린다', () => {
    data.jobs = [{ id: 'r1', kind: 'shot_rough_storyboard', target: { writerShotIds: ['b'] } }]
    const html = renderToStaticMarkup(createElement(StoryboardHeaderActions))
    expect(html).toContain('콘티 그림 1장을 실사 그림으로 바꿔요')
    data.jobs = []
    data.roughFill = { projectId: 'p1', pending: { a: true, b: true }, running: true }
    expect(buttons().map((b) => b.id)).toEqual(['storyboard-next-director'])
    const src = readFileSync('src/features/storyboard/header-actions.tsx', 'utf8')
    expect(src).toMatch(/const drawingNotice = roughDrawingNotice\(locale, view\.roughDrawing\.map\(nameOf\)\)\s*if \(drawingNotice\) toast\.info\(drawingNotice\)\s*const notice = noContiNotice/)
  })
})

describe('콘티 그림 없는 샷 알림', () => {
  // 왜(혼자 정한 것 f): 빼고 만든 샷이 말없이 콘티로 남으면 고장으로 보인다 — 어느 샷이 왜 빠졌고 어디서 그리는지 알린다.
  it('콘티 그림이 없는 샷을 빼고 시작하면 빠진 샷 이름과 Writer 에서 그린 뒤 다시 누르라는 말을 알린다', () => {
    expect(noContiNotice('ko', ['샷 3', '샷 7'])).toBe('콘티 그림이 없는 샷 3, 샷 7은(는) 빼고 만들어요. Writer 콘티에서 그린 뒤 다시 [시작]을 눌러 주세요.')
    expect(noContiNotice('en', ['Shot 3'])).toBe('Shot 3 has no rough storyboard, so it is left out. Draw it in Writer, then press Start again.')
    expect(noContiNotice('ko', [])).toBeNull()
  })

  // 왜: 이름이 넘치면 알림이 화면을 덮는다 — 넘김 창과 같은 규칙(열 개까지 이름, 나머지는 수).
  it('콘티 그림이 없는 샷이 열 개를 넘으면 열 개까지 이름을 적고 나머지는 수로 알린다', () => {
    const names = Array.from({ length: 12 }, (_, i) => `샷 ${i + 1}`)
    const text = noContiNotice('ko', names) ?? ''
    expect(text).toContain('샷 10 외 2컷')
    expect(text).not.toContain('샷 11')
  })
})
