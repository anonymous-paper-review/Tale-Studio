// Storyboard 실사 카드 상세의 [화살표 고치기](N4b) — 단추가 보이는 때 · 누르면 실사 편집기 · 저장하면 묻지 않고 끝 장 다시 그리기 · 그 카드에만 기다림 — 을 검사한다
import { readFileSync } from 'node:fs'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  project: { projectId: 'p1' },
  writer: {
    sceneManifest: { scenes: [{ sceneId: 's1', location: '', timeOfDay: '' }], characters: [], locations: [] },
    shots: [] as Array<Record<string, unknown>>,
  },
  images: { projectId: 'p1', images: {} as Record<string, unknown> },
  jobs: [] as unknown[],
  posted: [] as Array<{ url: string; body: Record<string, unknown> }>,
  respond: { status: 200, body: {} as Record<string, unknown> },
}))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select(data.project) }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/lib/storyboard/real-images-store', () => ({ useStoryboardRealImages: Object.assign((select: (s: unknown) => unknown) => select(data.images), { getState: () => ({ load: vi.fn(async () => {}) }) }) }))
vi.mock('@/lib/generation-queue', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), useActiveGenerationJobs: () => data.jobs, refreshGenerationQueue: vi.fn() }))
vi.mock('@/lib/generation-jobs-client', () => ({ pollGenerationJob: vi.fn(async () => 'https://x/new-end.png') }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn(async () => {}) }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: Object.assign(() => null, { getState: () => ({ sendMessage: vi.fn(), loading: false }) }) }))
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: Object.assign((select: (s: unknown) => unknown) => select({ locale: 'ko' }), { getState: () => ({ locale: 'ko' }) }) }))
vi.mock('@/stores/chat-ui-store', () => ({ useChatUiStore: Object.assign(() => null, { getState: () => ({ setCollapsed: vi.fn() }) }) }))
vi.mock('@/components/lumi/lumi', () => ({ Lumi: () => null }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다 — real-dialog 와 같은 방법).
vi.mock('@/components/ui/dialog', async () => {
  const { createElement: h } = await import('react')
  type Props = { children?: ReactNode; className?: string; open?: boolean }
  const plain = (tag: string) => ({ children, className }: Props) => h(tag, { className }, children)
  return {
    Dialog: ({ open, children }: Props) => (open ? children : null),
    DialogContent: plain('div'),
    DialogHeader: plain('div'),
    DialogFooter: plain('div'),
    DialogTitle: plain('h2'),
    DialogDescription: plain('p'),
  }
})

import { RealShotDialog } from '@/features/storyboard/real-shot-dialog'
import { fixSendRequest, realEndTarget, sameProjectReload, startRealEndRedraw } from '@/features/storyboard/real-arrow-edit'
import { sendFixToChat } from '@/lib/storyboard/fix-in-chat'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { realDrawingShotIds, storyboardCardWait } from '@/lib/storyboard/real-board'
import { withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { translate } from '@/lib/i18n/translate'
import type { ActiveJob } from '@/lib/generation-queue'

// 이 시험을 위해 지은 보드 — 샷 a 는 콘티만, 샷 b 는 실사 세 장(v1 · v2, 지금 그림 v2)이 있다.
const conti = { url: 'https://x/rough-start.png', status: 'completed', errorMessage: null, generatedAt: 1, frames: { start: 'https://x/rough-start.png', direction: 'https://x/rough-dir.png', end: 'https://x/rough-end.png' } }
const F1 = { start: 'https://x/real1-start.png', direction: 'https://x/real1-dir.png', end: 'https://x/real1-end.png' }
const F2 = { start: 'https://x/real-start.png', direction: 'https://x/real-dir.png', end: 'https://x/real-end.png' }
const real = withStoryboardVersion(withStoryboardVersion(null, { id: 'g1', url: F1.start, frames: F1, generatedAt: 1, source: 'generated' }, { select: true }), { id: 'g2', url: F2.start, frames: F2, generatedAt: 2, source: 'generated' }, { select: true })
const LINE = { en: 'She stands and walks out to the right.', ko: '그녀가 일어나 오른쪽으로 나간다.', source: 'ai', direction: F2.direction, at: 1, endDrawn: null }
// 정적 렌더는 저장소의 처음 상태를 읽는다 — 지금 상태를 처음 상태에 옮겨 그린다(shot-detail-view 의 syncStores 와 같다).
const dialog = (shotId: string | null = 'b') => {
  Object.assign(useBoardUiStore.getInitialState(), useBoardUiStore.getState())
  return renderToStaticMarkup(createElement(RealShotDialog, { shotId, onOpenChange: () => {} }))
}
const ko = (text: string) => translate('ko', text)
function buttonTag(out: string, testId: string): string {
  const at = out.indexOf(`data-testid="${testId}"`)
  expect(at, testId).toBeGreaterThan(-1)
  const start = out.lastIndexOf('<button', at)
  return out.slice(start, out.indexOf('>', start) + 1)
}

beforeEach(() => {
  data.writer.shots = [
    { shotId: 'a', sceneId: 's1', shotType: 'WS', durationSeconds: 3, actionDescription: '버스가 선다', dialogueLines: [], roughStoryboard: conti },
    { shotId: 'b', sceneId: 's1', shotType: 'MS', durationSeconds: 5, actionDescription: '미나가 돌아본다', dialogueLines: [], roughStoryboard: conti },
  ]
  data.images = { projectId: 'p1', images: { b: { ...real, directionRead: LINE } } }
  data.jobs = []
  data.posted = []
  data.respond = { status: 200, body: { data: { jobId: 'job-1', read: LINE, replayed: false } } }
  useBoardUiStore.setState({ shotEditId: 'b', shotEditVersionId: null, realArrowShotId: null, cardDrawing: {} })
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: string }) => {
    data.posted.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(JSON.stringify(data.respond.body), { status: data.respond.status, headers: { 'content-type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('Storyboard 상세의 [화살표 고치기]', () => {
  // 왜(같이 정한 것 · N4b): 실사 그림에서 화살표를 고치는 입구 — 콘티와 같은 편집기(층 나누기 · 펜 · 지우개 · 저장)가 실사 가운데 장을 연다.
  //   편집기는 실사 길로 보낸다(편집기 아래 알림이 실사 말이다). 큰 그림 자리를 편집기가 차지하고 [그림으로 돌아가기]로 돌아간다.
  it('실사 카드 상세에서 [화살표 고치기]를 누르면 실사 가운데 장이 콘티와 같은 화살표 편집기로 열린다', () => {
    const closed = dialog('b')
    expect(closed).toContain(ko('Edit arrows'))
    expect(buttonTag(closed, 'real-arrow-edit-open')).not.toContain('disabled=""')
    expect(closed).not.toContain('data-testid="real-arrow-edit"')
    // 단추는 이 샷의 편집을 연다.
    expect(readFileSync('src/features/storyboard/real-shot-dialog.tsx', 'utf8')).toMatch(/onClick=\{\(\) => useBoardUiStore\.getState\(\)\.setRealArrowShotId\(shotId\)\}/)
    useBoardUiStore.getState().setRealArrowShotId('b')
    const open = dialog('b')
    expect(open).toContain('data-testid="real-arrow-edit"')
    expect(open).toContain('data-testid="directing-editor-save-row"')
    expect(open).toContain(ko('Edit the arrows on the middle frame'))
    expect(open).toContain(ko('When you save, the end frame is redrawn to match your arrows. It takes over a minute.'))
    expect(open).toContain(ko('Back to the picture'))
    // AI 가 읽은 한 줄이 편집기 아래에 보이고(실사 말), 큰 그림은 편집기가 대신한다.
    expect(open).toContain(LINE.ko)
    expect(open).toContain(ko('The end frame is not drawn from this line yet. Videos use this line.'))
    expect(open).not.toContain('https://x/real-start.png')
  })

  // 왜(혼자 정한 것 h · g): 지금 그림만 고친다 — 지난 판을 보는 동안 · 실사가 없는 샷에는 입구가 없다. 그 샷을 그리는 중이면 끝 장이 엉뚱한 판에 끼지 않게 끈다.
  it('지난 판을 보는 동안이나 실사가 없는 샷에서는 [화살표 고치기]가 없고, 그 샷을 그리는 중이면 꺼진다', () => {
    useBoardUiStore.getState().openShotVersion('b', 'g1')
    expect(dialog('b')).not.toContain('data-testid="real-arrow-edit-open"')
    useBoardUiStore.getState().setShotEditId('a')
    expect(dialog('a')).not.toContain('data-testid="real-arrow-edit-open"')
    useBoardUiStore.getState().setShotEditId('b')
    data.jobs = [{ id: 'job-full', kind: 'shot_storyboard', target: { writerShotId: 'b', gridVariant: 'strip1' }, cancelledAt: null }]
    expect(buttonTag(dialog('b'), 'real-arrow-edit-open')).toContain('disabled=""')
    // 이미 열린 편집기도 잠기고 까닭을 보인다.
    useBoardUiStore.getState().setRealArrowShotId('b')
    const locked = dialog('b')
    expect(locked).toContain('data-locked="true"')
    expect(locked).toContain(ko('This shot is being drawn. You can change it when it is done.'))
  })

  // 왜: 다른 샷 · 지난 판을 열거나 상세를 닫은 뒤 다시 열 때 편집기가 열린 채로 남지 않게(어느 샷을 고치는지 헷갈리지 않게).
  it('다른 샷이나 지난 판을 열거나 상세를 닫으면 화살표 편집도 닫힌다', () => {
    const store = useBoardUiStore.getState()
    store.setRealArrowShotId('b')
    store.setShotEditId('a')
    expect(useBoardUiStore.getState().realArrowShotId).toBeNull()
    useBoardUiStore.getState().setRealArrowShotId('b')
    useBoardUiStore.getState().openShotVersion('b', 'g1')
    expect(useBoardUiStore.getState().realArrowShotId).toBeNull()
    useBoardUiStore.getState().setRealArrowShotId('b')
    useBoardUiStore.getState().setShotEditId(null)
    expect(useBoardUiStore.getState().realArrowShotId).toBeNull()
  })
})

describe('저장 뒤 끝 장 다시 그리기', () => {
  // 왜(같이 정한 것 · N4b "수정하면 마지막 프레임 수정해줘"): 콘티처럼 [그대로]를 고르는 물음 없이 실사 길로 끝 장 작업을 낸다.
  //   작업을 받으면 바로 다시 읽어 읽은 줄을 보이고, 다 그리면 한 번 더 읽어 새 끝 장을 보인다.
  it('실사 가운데 장에 그린 화살표를 저장하면 묻지 않고 실사 끝 장을 고친 화살표대로 다시 그린다', async () => {
    const askLine = vi.fn()
    const onChanged = vi.fn(async () => {})
    await expect(startRealEndRedraw({ projectId: 'p1', shotId: 'b', onChanged, t: ((k: string) => k) as never, askLine })).resolves.toBe(true)
    expect(data.posted).toEqual([{ url: '/api/storyboard/real-directing-edit', body: { action: 'regenerate-frame', projectId: 'p1', shotId: 'b', frame: 'end' } }])
    expect(askLine).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalledTimes(2)
    // 편집기는 저장 뒤 물음 대신 이 길을 부른다.
    const pane = readFileSync('src/features/storyboard/real-arrow-edit.tsx', 'utf8')
    expect(pane).toMatch(/onArrowsSaved=\{redraw\}/)
    expect(pane).not.toMatch(/onArrowsSaved=\{\(\) => (void )?guard\.askEnd/)
  })

  // 왜(혼자 정한 것 k): 줄 없이 그리면 ② 가 아니다 — 못 읽었으면 그림 값을 쓰지 않고 줄을 직접 적는 물음 창(실사 길)을 연다.
  it('읽는 AI 가 화살표를 못 읽었으면 끝 장을 그리지 않고 줄을 직접 적는 창을 연다', async () => {
    data.respond = { status: 422, body: { error: 'x', code: 'direction_unreadable' } }
    const askLine = vi.fn()
    await expect(startRealEndRedraw({ projectId: 'p1', shotId: 'b', onChanged: async () => {}, t: ((k: string) => k) as never, askLine })).resolves.toBe(false)
    expect(askLine).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', shotId: 'b', endpoint: '/api/storyboard/real-directing-edit' }))
  })

  // 왜(같이 정한 것 · O7 · W5 결): 끝 장을 그리는 1분 넘게 화면 · 채팅을 막지 않는다 — 그 카드에만 기다림(큐에 오르기 전 틈은 cardDrawing, 그 뒤는 실사 작업).
  it('실사 끝 장을 다시 그리는 동안 화면 · 채팅은 막지 않고 그 카드에만 기다림이 뜬다', async () => {
    let during: Record<string, string> = {}
    // 다른 샷 a 에도 실사가 있다 — 그리는 동안 a 의 상세 · 채팅 고치기가 그대로인지 본다(검토 rev-realarrow 9: 이름대로).
    data.images = { projectId: 'p1', images: { ...data.images.images, a: real } }
    let otherDetail = ''
    let chatSend = ''
    const onChanged = vi.fn(async () => {
      during = { ...useBoardUiStore.getState().cardDrawing }
      useBoardUiStore.getState().setShotEditId('a')
      otherDetail = dialog('a')
      chatSend = sendFixToChat('@샷 1', '우산 손잡이가 보이게')
    })
    await startRealEndRedraw({ projectId: 'p1', shotId: 'b', onChanged, t: ((k: string) => k) as never, askLine: vi.fn() })
    expect(during).toEqual({ b: 'p1' })
    // 화면: 다른 샷 상세는 잠기지 않는다(고치기 칸 · [화살표 고치기] 켜짐). 채팅: 고칠 말이 그대로 보내진다.
    expect(otherDetail).not.toMatch(/<textarea[^>]*disabled=""/)
    expect(buttonTag(otherDetail, 'real-arrow-edit-open')).not.toContain('disabled=""')
    expect(chatSend).toBe('sent')
    expect(useBoardUiStore.getState().cardDrawing).toEqual({})
    // 큐에 오른 실사 끝 장 작업은 그 샷 카드만 "그리는 중"으로 만든다.
    const jobs = [{ id: 'job-1', kind: 'shot_storyboard', target: { writerShotId: 'b', realEnd: { versionId: 'arrows-1', direction: 'd', line: 'l' } } }] as unknown as ActiveJob[]
    const drawing = realDrawingShotIds(jobs)
    const batch = { busy: false, cancelled: false, shotIds: null }
    expect(storyboardCardWait({ shotId: 'b', hasReal: true, hasConti: true, drawing, batch })).toBe('drawing')
    expect(storyboardCardWait({ shotId: 'a', hasReal: true, hasConti: true, drawing, batch })).toBe('none')
  })
})

describe('검토 rev-realarrow — 상세의 잠금 · 보내기 · 다시 읽기', () => {
  // 왜(검토 rev-realarrow 2): 저장 뒤 끝 장 작업이 큐에 오르기 전 틈(cardDrawing)에도 다시 저장 · 고치기를 하면 옛 판과 겹친다 — 그 틈도 그리는 중으로 본다.
  it('끝 장 작업이 큐에 오르기 전에도 그 샷의 [화살표 고치기] · 편집기 · 고치기 칸이 잠긴다', () => {
    useBoardUiStore.setState({ cardDrawing: { b: 'p1' } })
    expect(buttonTag(dialog('b'), 'real-arrow-edit-open')).toContain('disabled=""')
    expect(dialog('b')).toMatch(/<textarea[^>]*disabled=""/)
    useBoardUiStore.getState().setRealArrowShotId('b')
    expect(dialog('b')).toContain('data-locked="true"')
    // 다른 프로젝트의 표시는 이 상세를 잠그지 않는다.
    useBoardUiStore.setState({ cardDrawing: { b: 'other-project' }, realArrowShotId: null })
    expect(buttonTag(dialog('b'), 'real-arrow-edit-open')).not.toContain('disabled=""')
  })

  // 왜(검토 rev-realarrow 2): 물음 창 [다시 그리기] 길도 같은 잠금을 쓴다 — 실사 상세가 만드는 대상은 그리는 동안 cardDrawing 을 켠다.
  it('실사 상세의 끝 장 대상은 실사 주소로 보내고, 그리는 동안 그 카드 표시를 켜고 끈다', () => {
    const target = realEndTarget('p1', 'b', async () => {})
    expect(target.endpoint).toBe('/api/storyboard/real-directing-edit')
    target.track?.(true)
    expect(useBoardUiStore.getState().cardDrawing).toEqual({ b: 'p1' })
    target.track?.(false)
    expect(useBoardUiStore.getState().cardDrawing).toEqual({})
    const pane = readFileSync('src/features/storyboard/real-arrow-edit.tsx', 'utf8')
    expect(pane).toMatch(/onRedrawEnd=\{\(\) => void guard\.askEnd\(target\)\}/)
    expect(pane).toMatch(/const target = realEndTarget\(projectId, shotId, onChanged\)/)
  })

  // 왜(검토 rev-realarrow 6): 저장하지 않은 화살표가 있는데 [Lumi 에게 고쳐 달라고 하기]로 창이 닫히면 그린 것을 잃는다 — 보내기 전에 먼저 묻는다.
  it('저장하지 않은 화살표가 있으면 [Lumi 에게 고쳐 달라고 하기]는 보내기 전에 먼저 묻는다', () => {
    expect(fixSendRequest(true)).toBe('ask')
    expect(fixSendRequest(false)).toBe('send')
    const source = readFileSync('src/features/storyboard/real-shot-dialog.tsx', 'utf8')
    expect(source).toMatch(/if \(fixSendRequest\(guard\.dirty\) === 'ask'\) guard\.requestLeave\(deliver\)/)
  })

  // 왜(검토 rev-realarrow 4): 끝 장은 1분 넘게 걸린다 — 그사이 다른 프로젝트로 옮겼으면 옛 프로젝트 그림을 읽어 지금 화면을 덮지 않는다.
  it('끝 장이 늦게 끝나 다시 읽을 때 지금 프로젝트가 같을 때만 다시 읽는다', async () => {
    const reload = vi.fn(async () => {})
    let currentProject: string | null = 'p1'
    const onChanged = sameProjectReload('p1', () => currentProject, reload)
    await onChanged()
    currentProject = 'p2'
    await onChanged()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(readFileSync('src/features/storyboard/real-shot-dialog.tsx', 'utf8')).toMatch(/sameProjectReload\(projectId, \(\) => useProjectStore\.getState\(\)\.projectId,/)
  })
})
