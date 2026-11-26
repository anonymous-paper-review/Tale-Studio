// Storyboard 화면이 샷을 아직 다 읽기 전에는 "아직 생성된 씬·샷이 없어요" 대신 Storyboard 기다리는 카드를 보이고, 받아 둔 샷이 있으면 보드를 바로 보이는지 검사한다 (오너 2026-11-26 m1126 G1)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  project: { projectId: 'p1', initLoading: false, currentStage: 'writer' },
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
  data.project = { projectId: 'p1', initLoading: false, currentStage: 'writer' }
  data.writer = { sceneManifest: null, shots: [] }
  data.status = null
  data.error = null
})

describe('Storyboard 를 여는 동안', () => {
  // 왜: 레일로 Storyboard 에 오면 샷을 읽는 0.23~0.6초 동안 "아직 생성된 씬·샷이 없어요 · Artist에서 [완료하기]를 누르면 씬 · 샷을 나눠요"가 보였다(2026-11-26 실측) —
  //   다 만든 프로젝트인데 틀린 안내다. 대사 탭을 기억해 둔 경우도 같은 자리에서 기다린다.
  it('Storyboard 는 샷이 아직 없고 보드 읽기나 진행 상태 읽기가 안 끝났으면 "아직 생성된 씬·샷이 없어요" 대신 Storyboard 기다리는 카드를 보인다', () => {
    const out = screen()
    expect(out).toContain('data-stage-wait="writer"')
    expect(out).toContain('스토리보드를 불러오는 중…')
    expect(out).not.toContain('ROUGH_BOARD')

    // 대사 탭을 기억해 둔 채 열어도 같다.
    data.ui = { ...data.ui, activeTab: 'dialogue' }
    expect(screen()).toContain('data-stage-wait="writer"')

    // 프로젝트를 여는 중이어도 같다.
    data.project = { projectId: null as unknown as string, initLoading: true, currentStage: 'writer' }
    expect(screen()).toContain('data-stage-wait="writer"')
  })

  // 왜: Artist · Director 에서 이미 샷을 받아 둔 채 옮겨 오면(1.5초 뒤 미리 받기 포함) 기다릴 까닭이 없다 — 보드를 바로 보이고 뒤에서 다시 읽는다.
  it('Storyboard 는 받아 둔 샷이 있으면 기다리는 카드 없이 보드를 바로 보인다', () => {
    data.writer = { sceneManifest: { scenes: [{ sceneId: 'sc_a' }], characters: [], locations: [] }, shots: [{ shotId: 'a1', sceneId: 'sc_a' }] }
    const out = screen()
    expect(out).toContain('ROUGH_BOARD')
    expect(out).not.toContain('data-testid="stage-wait"')
  })
})
