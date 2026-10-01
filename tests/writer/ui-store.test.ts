// Writer 화면 이름이 잘못되거나 없으면 안전하게 스토리보드 화면을 보여준다 (#dialogue-v4)
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
  })
})

import { normalizeWriterTab, useWriterUiStore } from '@/stores/writer-ui-store'

afterAll(() => vi.unstubAllGlobals())

describe('normalizeWriterTab', () => {
  it('지원하는 화면 이름을 넣으면 그대로 열고 잘못된 값이면 스토리보드 화면을 연다 (#dialogue-v4)', () => {
    expect(normalizeWriterTab('v2')).toBe('v2')
    expect(normalizeWriterTab('storyboard')).toBe('storyboard')
    expect(normalizeWriterTab('dialogue')).toBe('dialogue')
    expect(normalizeWriterTab('sheet')).toBe('sheet')
    expect(normalizeWriterTab(undefined)).toBe('storyboard')
    expect(normalizeWriterTab('garbage')).toBe('storyboard')
    expect(normalizeWriterTab(42)).toBe('storyboard')
  })

  it('예전에 트리트먼트 탭을 선택했으면 러프 스토리보드 화면을 연다', () => {
    expect(normalizeWriterTab('script')).toBe('storyboard')
    const merge = useWriterUiStore.persist.getOptions().merge!
    const restored = merge({ activeTab: 'script' }, useWriterUiStore.getState())
    expect(restored.activeTab).toBe('storyboard')
  })
})
