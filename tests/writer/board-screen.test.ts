// Storyboard 화면 머리(이름 · 숫자 · Director 버튼)와, 씬 · 샷을 나누는 동안 보드를 덮는 방식 · 카드 누르기를 검사한다
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  project: { projectId: 'p1', currentStage: 'writer' },
  writer: {
    sceneManifest: { scenes: [{ sceneId: 'sc_a' }, { sceneId: 'sc_b' }], characters: [], locations: [] },
    shots: [
      { shotId: 'a1', sceneId: 'sc_a', durationSeconds: 2.5, actionDescription: '문을 연다', roughStoryboard: null },
      { shotId: 'a2', sceneId: 'sc_a', durationSeconds: 3, actionDescription: '밖을 본다', roughStoryboard: null },
      { shotId: 'b1', sceneId: 'sc_b', durationSeconds: 4.4, actionDescription: '걸어간다', roughStoryboard: null },
    ],
  },
  chat: { loading: false, directorHandoff: null },
  ui: { activeTab: 'storyboard', setActiveTab: () => {}, setV2Available: () => {} },
  status: null as Record<string, unknown> | null,
}))

vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select(data.project) }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: (select: (s: unknown) => unknown) => select(data.chat) }))
vi.mock('@/stores/writer-ui-store', () => {
  const useWriterUiStore = Object.assign((select: (s: unknown) => unknown) => select(data.ui), { getState: () => data.ui })
  return { useWriterUiStore }
})
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/features/writer/writer-tabs', () => ({ WriterTabs: () => null }))
vi.mock('@/features/writer/writer-engine-picker', () => ({ WriterEnginePicker: () => null }))
vi.mock('@/components/stage-help-badge', () => ({ StageHelpBadge: () => null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: data.status, restart: () => {} }) }))
vi.mock('@/features/writer/rough-storyboard-view', async () => {
  const { createElement: h } = await import('react')
  return { RoughStoryboardView: () => h('div', null, 'ROUGH_BOARD') }
})
vi.mock('@/features/writer/writer-generation-view', async () => {
  const { createElement: h } = await import('react')
  return { WriterGenerationView: () => h('div', null, 'FULL_PAGE_GENERATION_VIEW') }
})
vi.mock('@/features/writer/dialogue-view', () => ({ DialogueView: () => null }))
vi.mock('@/features/writer/master-sheet-view', () => ({ MasterSheetView: () => null }))
vi.mock('@/features/writer/writer-v2-preview', () => ({ WriterV2Preview: () => null }))

import { WriterHeader } from '@/features/writer/writer-header'
import { WriterWorkspace } from '@/features/writer/writer-workspace'

beforeEach(() => {
  data.status = null
})

describe('Storyboard 화면 머리', () => {
  // 왜: 화면 이름은 리뉴얼 순서의 단계 이름 Storyboard 다(예전 이름 Writers' Room 은 지금 산문 단계와 헷갈린다). 러닝타임은 지표로 제목 옆에만 작게.
  it('Storyboard 화면을 열면 머리에 "Storyboard"와 씬 · 샷 · 초가 보이고 "Writers\' Room"은 보이지 않는다', () => {
    const html = renderToStaticMarkup(createElement(WriterHeader))
    expect(html).toContain('>Storyboard<')
    expect(html).toContain('씬 2 · 샷 3 · 10초')
    expect(html).not.toContain('Writers')
  })

  // 왜: 러닝타임은 목표가 아니라 샷 길이에서 나오는 지표다(프로토타입 S1에서 입력칸 · 목표 막대를 뺐다).
  it('머리에는 러닝타임 입력칸이나 목표 막대가 없다', () => {
    const html = renderToStaticMarkup(createElement(WriterHeader))
    expect(html).not.toContain('<input')
    expect(html).not.toContain('role="progressbar"')
  })

  // 왜: Storyboard 의 다음 단계는 Director 다 — 일반 다음 단계 버튼은 이 단계에서 아무것도 보여 주지 않았다.
  it('머리 오른쪽에는 [다음: Director로] 버튼이 있다', () => {
    const html = renderToStaticMarkup(createElement(WriterHeader))
    expect(html).toContain('다음: Director로')
    expect(html).toContain('data-testid="storyboard-next-director"')
  })
})

describe('씬 · 샷을 나누는 동안의 화면', () => {
  // 왜: 나누는 동안에도 보드 위에 잠금 표시를 얹는다(프로토타입 S0) — 예전 전체 화면 진행 보기와 그 인물 서랍은 Artist 에서 끝난 정보라 다시 보여 주지 않는다.
  it('씬 · 샷을 나누는 중이면 전체 화면 진행 보기 대신 보드를 그대로 둔다', () => {
    data.status = { started: true, engine: 'v1', pipeline_completed: false, pipeline_failed: false, current_status: 'running', current_stage: 'decoupage' }
    const html = renderToStaticMarkup(createElement(WriterWorkspace))
    expect(html).toContain('ROUGH_BOARD')
    expect(html).not.toContain('FULL_PAGE_GENERATION_VIEW')
  })
})

describe('보드 카드 누르기', () => {
  const view = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')

  // 왜: 카드를 Ctrl/Cmd 로 눌러 채팅에 붙이는 여러 샷 선택은 없앴다(프로토타입 S1) — 그냥 누르면 샷 상세가 열리는 동작만 남긴다.
  it('보드 카드와 씬 이름을 Ctrl/Cmd로 눌러도 채팅에 붙이지 않는다', () => {
    expect(view).not.toContain('mentionLabelForModifierClick')
    expect(view).not.toContain('requestMentionToggle')
    expect(view).not.toContain('onClickCapture')
  })

  // 왜: 숨은 조작키 없이 누르면 언제나 같은 일이 일어나야 한다 — Ctrl 을 누른 채 눌러도 샷 상세가 열린다.
  it('보드 카드를 누르면 조작키와 상관없이 샷 상세를 연다', () => {
    expect(view).toContain('onClick={() => openDetail(shot.shotId)}')
    expect(view).not.toMatch(/event\.ctrlKey \|\| event\.metaKey/)
  })
})
