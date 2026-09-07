// Writer 화면 이름이 잘못되거나 없으면 안전하게 스토리보드 화면을 보여준다 (#dialogue-v4)
import { describe, expect, it } from 'vitest'
import { normalizeWriterTab } from '@/stores/writer-ui-store'

describe('normalizeWriterTab', () => {
  it('지원하는 화면 이름을 넣으면 그대로 열고 잘못된 값이면 스토리보드 화면을 연다 (#dialogue-v4)', () => {
    expect(normalizeWriterTab('script')).toBe('script')
    expect(normalizeWriterTab('storyboard')).toBe('storyboard')
    expect(normalizeWriterTab('dialogue')).toBe('dialogue')
    expect(normalizeWriterTab(undefined)).toBe('storyboard')
    expect(normalizeWriterTab('garbage')).toBe('storyboard')
    expect(normalizeWriterTab(42)).toBe('storyboard')
  })
})
