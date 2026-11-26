// Storyboard 화면 머리가 지금처럼 단계 이름 · 씬 · 샷 · 초를 보이고, 탭 줄이 [스토리보드 | 대사]이며 첫 칸 이름이 "스토리보드"인지 검사한다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  writer: {
    sceneManifest: { scenes: [{ sceneId: 's1' }, { sceneId: 's2' }], characters: [], locations: [] },
    shots: [
      { shotId: 'a', sceneId: 's1', durationSeconds: 4 },
      { shotId: 'b', sceneId: 's2', durationSeconds: 6 },
    ],
  },
  ui: { activeTab: 'storyboard', setActiveTab: () => {} },
}))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/stores/writer-ui-store', () => ({ useWriterUiStore: (select: (s: unknown) => unknown) => select(data.ui) }))
vi.mock('@/features/storyboard/header-actions', () => ({ StoryboardHeaderActions: () => null }))
vi.mock('@/components/stage-help-badge', () => ({ StageHelpBadge: () => null }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useLocale: () => 'ko', useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { StoryboardHeader, StoryboardTabs } from '@/features/storyboard/storyboard-header'

describe('Storyboard 머리 · 탭', () => {
  // 왜(오너 S1 "현재 UI 그대로 — 스토리보드랑 대사"): 탭은 두 칸 그대로다.
  // 왜(오너 S4 "러프스토리보드 > 스토리보드"): 첫 칸 이름은 "스토리보드" — "러프 스토리보드"(→ 콘티)는 Writer 콘티의 칸 이름이다.
  it('Storyboard 탭 줄은 [스토리보드 | 대사]이고 첫 칸 이름은 "러프 스토리보드"가 아니라 "스토리보드"다', () => {
    const html = renderToStaticMarkup(createElement(StoryboardTabs))
    const labels = [...html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map(([, inner]) => inner.replace(/<[^>]+>/g, ''))
    expect(labels).toEqual(['스토리보드', '대사'])
    expect(html).not.toContain('러프 스토리보드')
  })

  // 왜(혼자 정한 것): 관리자 V2 미리보기는 씬 · 샷 나누기 결과를 보는 칸이라 Writer 콘티에 둔다 — Storyboard 탭 줄에는 없다.
  it('Storyboard 탭 줄에는 관리자 V2 미리보기 칸이 없다', () => {
    expect(renderToStaticMarkup(createElement(StoryboardTabs))).not.toContain('V2')
  })

  // 왜(오너 S1): 화면 이름은 단계 이름 Storyboard, 러닝타임은 지표로 제목 옆에 작게(지금 머리와 같다).
  it('Storyboard 머리에는 단계 이름 "Storyboard"와 씬 · 샷 · 초가 보인다', () => {
    const html = renderToStaticMarkup(createElement(StoryboardHeader))
    expect(html).toContain('>Storyboard<')
    expect(html).toContain('씬 2 · 샷 2 · 10초')
  })
})
