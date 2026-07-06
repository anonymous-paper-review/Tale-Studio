import { describe, expect, it } from 'vitest'
import { normalizeWriterTab } from '@/stores/writer-ui-store'

describe('normalizeWriterTab', () => {
  it('keeps supported tabs and falls back for disabled or malformed values', () => {
    expect(normalizeWriterTab('script')).toBe('script')
    expect(normalizeWriterTab('storyboard')).toBe('storyboard')
    expect(normalizeWriterTab('dialogue')).toBe('storyboard')
    expect(normalizeWriterTab(undefined)).toBe('storyboard')
    expect(normalizeWriterTab('garbage')).toBe('storyboard')
    expect(normalizeWriterTab(42)).toBe('storyboard')
  })
})
