// 콘티 화면(지금 보드를 콘티 단계에서 쓴다)의 머리 이름 · [Artist로 가기] · 넘김 권유 · 잠금 표시가 콘티에 맞는지 검사한다 (오너 2026-11-26 O1 · W4, 리드 구조 C)
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  project: { projectId: 'p1', currentStage: 'conti' },
  writer: {
    sceneManifest: { scenes: [{ sceneId: 'sc_a' }, { sceneId: 'sc_b' }], characters: [], locations: [] },
    shots: [
      { shotId: 'a1', sceneId: 'sc_a', durationSeconds: 2.5, actionDescription: '문을 연다', roughStoryboard: null },
      { shotId: 'a2', sceneId: 'sc_a', durationSeconds: 3, actionDescription: '밖을 본다', roughStoryboard: null },
      { shotId: 'b1', sceneId: 'sc_b', durationSeconds: 4.4, actionDescription: '걸어간다', roughStoryboard: null },
    ] as unknown[],
  },
  chat: { loading: false, directorHandoff: null, handoffConfirm: null },
}))

vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select(data.project) }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: (select: (s: unknown) => unknown) => select(data.chat) }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/features/writer/writer-tabs', () => ({ WriterTabs: () => null }))
vi.mock('@/features/writer/writer-engine-picker', () => ({ WriterEnginePicker: () => null }))
vi.mock('@/components/stage-help-badge', () => ({ StageHelpBadge: () => null }))

import { WriterHeader } from '@/features/writer/writer-header'
import { storyboardBusyView, INITIAL_BOARD_LOCK, type BoardLockFacts } from '@/lib/writer/board-busy'

const read = (path: string) => readFileSync(path, 'utf8')
const button = (html: string, testId: string) => html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? ''

beforeEach(() => {
  data.project = { projectId: 'p1', currentStage: 'conti' }
  data.writer.shots = [
    { shotId: 'a1', sceneId: 'sc_a', durationSeconds: 2.5, actionDescription: '문을 연다', roughStoryboard: null },
    { shotId: 'a2', sceneId: 'sc_a', durationSeconds: 3, actionDescription: '밖을 본다', roughStoryboard: null },
    { shotId: 'b1', sceneId: 'sc_b', durationSeconds: 4.4, actionDescription: '걸어간다', roughStoryboard: null },
  ]
})

describe('콘티 화면 머리', () => {
  // 왜(혼자 정한 것): 콘티 화면은 지금 Storyboard 보드를 쓰지만 이름은 콘티다 — 머리에 "Storyboard"가 보이면 다른 단계(실사 Storyboard)로 읽힌다.
  it('콘티 화면 머리에는 "콘티"와 씬 · 샷 · 초가 보이고 "Storyboard"는 보이지 않는다', () => {
    const html = renderToStaticMarkup(createElement(WriterHeader))
    expect(html).toContain('>콘티<')
    expect(html).toContain('씬 2 · 샷 3 · 10초')
    expect(html).not.toContain('>Storyboard<')
  })

  // 왜: O1 · W4 — 콘티를 마치고 Artist 로 가는 단추가 "Artist로 가기"다. 콘티의 다음 단계는 Director 가 아니다.
  it('콘티 화면 머리 오른쪽에는 [Artist로 가기]가 있고 [다음: Director로]는 없다', () => {
    const html = renderToStaticMarkup(createElement(WriterHeader))
    expect(button(html, 'conti-next-artist')).toContain('Artist로 가기')
    expect(html).not.toContain('다음: Director로')
    expect(html).not.toContain('data-testid="storyboard-next-director"')
  })

  // 왜: 정상 경로 고정 — [Artist로 가기]는 다른 단계 화면의 다음 단계 단추와 같은 길(넘김 문장을 채팅에 남기며 넘김)로 간다.
  it('[Artist로 가기]를 누르면 다음 단계 단추와 같은 길로 Artist 로 넘긴다', () => {
    expect(read('src/features/writer/writer-header.tsx')).toMatch(/onClick=\{\(\) => void useGlobalChatStore\.getState\(\)\.requestNextStep\(\)\}[\s\S]{0,200}data-testid="conti-next-artist"/)
  })

  // 왜(혼자 정한 것): 씬 · 샷이 아직 없으면(나누는 중 · 실패) Artist 로 넘길 콘티가 없다 — 러프를 다 그리지 않아도 씬 · 샷이 있으면 켠다(빠진 러프는 Storyboard 가 그린다).
  it('[Artist로 가기]는 씬 · 샷이 생기기 전에는 꺼져 있고, 러프를 다 그리지 않아도 씬 · 샷이 있으면 켜진다', () => {
    expect(button(renderToStaticMarkup(createElement(WriterHeader)), 'conti-next-artist')).not.toMatch(/\bdisabled=""/)
    data.writer.shots = []
    expect(button(renderToStaticMarkup(createElement(WriterHeader)), 'conti-next-artist')).toMatch(/\bdisabled=""/)
  })
})

describe('콘티 보드의 단계', () => {
  // 왜(혼자 정한 것): 같은 보드 부품이 콘티 · Storyboard 두 주소에서 쓰인다 — 첫 안내 · 넘김 권유 · 러프 내용 검사 알림이 지금 단계 채팅에 남아야
  //   콘티에서 생긴 말이 Storyboard 채팅에 섞이지 않는다.
  it('콘티 보드의 첫 안내 · 넘김 권유 · 러프 알림은 지금 보는 보드 단계 채팅에 남는다', () => {
    const board = read('src/features/writer/rough-storyboard-view.tsx')
    expect(board).toMatch(/const boardStage = useProjectStore\(\(s\) => boardStageOf\(s\.currentStage\)\)/)
    expect(board).toMatch(/handoffFrom\(boardStage\)/)
    expect(board).toMatch(/if \(boardStage === 'conti'\) announceRoughModerationFailures\('conti', moderationShots\)/)
    expect(board).not.toMatch(/stage: 'writer'/)
  })

  // 왜(혼자 정한 것): O1 — 산문을 확정하면 콘티에서 씬 · 샷을 나눈다. 잠금 제목이 "Storyboard로 넘어가는 중"이면 다른 단계로 가는 것처럼 읽히고,
  //   큰 Lumi 도 콘티(Writer 칸)의 옷이어야 한다.
  it('콘티에서 씬 · 샷을 나누는 동안 잠금 표시는 "콘티로 넘어가는 중이에요"이고 Storyboard 에서는 지금처럼 "Storyboard로 넘어가는 중이에요"다', () => {
    const facts: BoardLockFacts = { runActive: true, reloading: false, hasShots: false, generating: 0, failed: 0, pumpActive: false, autoDrawPending: false }
    const status = { started: true, current_status: 'running', current_stage: 'decoupage', pipeline_completed: false, pipeline_failed: false }
    const rough = { total: 0, completed: 0, generating: 0, waiting: 0, failed: 0 }
    const conti = storyboardBusyView({ status, facts, lock: INITIAL_BOARD_LOCK, rough, sceneCount: 2, boardStage: 'conti' }, 'ko')
    expect(conti.title).toBe('콘티로 넘어가는 중이에요')
    const storyboard = storyboardBusyView({ status, facts, lock: INITIAL_BOARD_LOCK, rough, sceneCount: 2 }, 'ko')
    expect(storyboard.title).toBe('Storyboard로 넘어가는 중이에요')
    expect(read('src/features/writer/rough-storyboard-view.tsx')).toMatch(/lumi=\{busy\.lumi \? STAGE_PERSONA\[boardStage\] : undefined\}/)
  })
})
