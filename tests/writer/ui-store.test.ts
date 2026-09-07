import { describe, expect, it } from 'vitest'
import { normalizeWriterTab } from '@/stores/writer-ui-store'

describe('normalizeWriterTab', () => {
  it('keeps supported tabs (dialogue 활성화됨 #dialogue-v4) and falls back for malformed values', () => {
    expect(normalizeWriterTab('script')).toBe('script')
    expect(normalizeWriterTab('storyboard')).toBe('storyboard')
    expect(normalizeWriterTab('dialogue')).toBe('dialogue')
    expect(normalizeWriterTab(undefined)).toBe('storyboard')
    expect(normalizeWriterTab('garbage')).toBe('storyboard')
    expect(normalizeWriterTab(42)).toBe('storyboard')
  })
})
