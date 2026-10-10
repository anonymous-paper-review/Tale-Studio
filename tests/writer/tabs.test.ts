// Writer는 트리트먼트 탭을 숨기고 남은 화면만 키보드로 순환한다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  activeTab: 'storyboard',
  setActiveTab: vi.fn(),
  v2Available: false,
  cycle: vi.fn(),
}))

vi.mock('@/stores/writer-ui-store', () => ({
  useWriterUiStore: (select: (value: typeof state) => unknown) => select(state),
}))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text }))
vi.mock('@/lib/use-alt-arrow-cycle', () => ({ useAltArrowCycle: state.cycle }))

import { WriterTabs } from '@/features/writer/writer-tabs'

beforeEach(() => {
  state.v2Available = false
  vi.clearAllMocks()
})

describe('Writer 탭', () => {
  it('Writer를 열면 트리트먼트 탭을 표시하지 않는다', () => {
    const html = renderToStaticMarkup(createElement(WriterTabs))
    expect(html).not.toContain('Treatment')
    expect(html.match(/role="tab"/g)).toHaveLength(3)
    expect(html).toContain('Rough storyboard')
    expect(html).toContain('Dialogue')
    expect(html).toContain('Master sheet')
  })

  it('Writer에서 탭을 순환하면 러프 스토리보드·대사·마스터 시트만 이동한다', () => {
    renderToStaticMarkup(createElement(WriterTabs))
    expect(state.cycle).toHaveBeenLastCalledWith(
      ['storyboard', 'dialogue', 'sheet'],
      'storyboard',
      state.setActiveTab,
    )

    state.v2Available = true
    const html = renderToStaticMarkup(createElement(WriterTabs))
    expect(html).not.toContain('Treatment')
    expect(html).toContain('V2 units')
    expect(state.cycle).toHaveBeenLastCalledWith(
      ['v2', 'storyboard', 'dialogue', 'sheet'],
      'storyboard',
      state.setActiveTab,
    )
  })
})
