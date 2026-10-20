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
import { writerTabOrder } from '@/lib/writer/tab-order'

afterAll(() => vi.unstubAllGlobals())

describe('normalizeWriterTab', () => {
  it('지원하는 화면 이름을 넣으면 그대로 열고 잘못된 값이면 스토리보드 화면을 연다 (#dialogue-v4)', () => {
    expect(normalizeWriterTab('v2')).toBe('v2')
    expect(normalizeWriterTab('storyboard')).toBe('storyboard')
    expect(normalizeWriterTab('dialogue')).toBe('dialogue')
    expect(normalizeWriterTab(undefined)).toBe('storyboard')
    expect(normalizeWriterTab('garbage')).toBe('storyboard')
    expect(normalizeWriterTab(42)).toBe('storyboard')
  })

  it('Storyboard 화면 탭은 러프 스토리보드와 대사뿐이다', () => {
    // 왜: 2026-10-20 오너 "storyboard 탭에서 마스터시트 지워주고 export로 기능 빼줘" — 마스터 시트는 [내보내기] 메뉴에서 받는다.
    expect(writerTabOrder(false)).toEqual(['storyboard', 'dialogue'])
    expect(writerTabOrder(true)).toEqual(['v2', 'storyboard', 'dialogue'])
  })

  it('예전에 마스터 시트 화면을 선택했으면 러프 스토리보드 화면을 연다', () => {
    // 왜: 마스터 시트 탭이 없어졌다(2026-10-20) — 그 탭을 열어 둔 채 떠난 사람도 빈 화면 없이 러프 보드로 돌아온다.
    expect(normalizeWriterTab('sheet')).toBe('storyboard')
    const merge = useWriterUiStore.persist.getOptions().merge!
    expect(merge({ activeTab: 'sheet' }, useWriterUiStore.getState()).activeTab).toBe('storyboard')
  })

  it('예전에 트리트먼트 탭을 선택했으면 러프 스토리보드 화면을 연다', () => {
    expect(normalizeWriterTab('script')).toBe('storyboard')
    const merge = useWriterUiStore.persist.getOptions().merge!
    const restored = merge({ activeTab: 'script' }, useWriterUiStore.getState())
    expect(restored.activeTab).toBe('storyboard')
  })
})
