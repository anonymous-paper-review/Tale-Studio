// 콘티 화면(같은 보드)을 여는 동안에는 Storyboard 가 아니라 콘티 기다리는 카드(Writer 옷 · "콘티를 불러오는 중…")를 보이는지 검사한다 (G1 · O1 2026-11-26, 리드 ③ — 같은 보드를 두 주소가 쓴다)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  project: { projectId: 'p1', initLoading: false, currentStage: 'conti' },
  writer: { sceneManifest: null as unknown, shots: [] as unknown[] },
  ui: { activeTab: 'storyboard', setActiveTab: () => {}, setV2Available: () => {} },
  status: null as Record<string, unknown> | null,
  error: null as string | null,
}))

vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select(data.project) }))
vi.mock('@/stores/writer-store', () => {
  const useWriterStore = Object.assign((select: (s: unknown) => unknown) => select(data.writer), { getState: () => ({ ...data.writer, loadProject: async () => {} }) })
  return { useWriterStore }
})
vi.mock('@/stores/writer-ui-store', () => {
  const useWriterUiStore = Object.assign((select: (s: unknown) => unknown) => select(data.ui), { getState: () => data.ui })
  return { useWriterUiStore }
})
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: data.status, error: data.error, restart: () => {} }) }))
vi.mock('@/features/writer/rough-storyboard-view', async () => {
  const { createElement: h } = await import('react')
  return { RoughStoryboardView: () => h('div', null, 'ROUGH_BOARD') }
})
vi.mock('@/features/writer/writer-generation-view', () => ({ WriterGenerationView: () => null }))
vi.mock('@/features/writer/dialogue-view', () => ({ DialogueView: () => null }))
vi.mock('@/features/writer/writer-v2-preview', () => ({ WriterV2Preview: () => null }))

import { WriterWorkspace } from '@/features/writer/writer-workspace'

const screen = () => renderToStaticMarkup(createElement(WriterWorkspace))

beforeEach(() => {
  data.project = { projectId: 'p1', initLoading: false, currentStage: 'conti' }
  data.writer = { sceneManifest: null, shots: [] }
  data.status = null
  data.error = null
})

describe('콘티를 여는 동안', () => {
  // 왜: 콘티 주소도 같은 보드를 그려 Storyboard 기다리는 카드("스토리보드를 불러오는 중…", Storyboard 옷)가 떴다 — 콘티는 레일의 Writer 칸이라 Writer 옷 콘티 카드여야 한다.
  it('콘티는 샷을 아직 다 읽기 전에는 Storyboard 가 아니라 콘티 기다리는 카드("콘티를 불러오는 중…")를 보인다', () => {
    const out = screen()
    expect(out).toContain('data-stage-wait="conti"')
    expect(out).toContain('콘티를 불러오는 중…')
    expect(out).not.toContain('스토리보드를 불러오는 중…')
  })

  // 왜: 정상 경로 고정 — Storyboard 주소는 지금처럼 Storyboard 기다리는 카드다(tests/writer/storyboard-open-wait.test.ts).
  it('같은 보드라도 Storyboard 주소에서는 지금처럼 Storyboard 기다리는 카드를 보인다', () => {
    data.project = { projectId: 'p1', initLoading: false, currentStage: 'writer' }
    expect(screen()).toContain('data-stage-wait="writer"')
  })
})
