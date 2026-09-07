import { describe, expect, it } from 'vitest'
import { applyRoughStoryboardZoomShortcut } from '@/features/writer/rough-storyboard-view'

const ctrl = { ctrlKey: true, metaKey: false }
const command = { ctrlKey: false, metaKey: true }

describe('applyRoughStoryboardZoomShortcut', () => {
  it('보드의 Ctrl/Command + 키만 한 단계씩 조절한다', () => {
    expect(applyRoughStoryboardZoomShortcut(4, { ...ctrl, key: '+' })).toBe(5)
    expect(applyRoughStoryboardZoomShortcut(4, { ...command, key: '+' })).toBe(5)
    expect(applyRoughStoryboardZoomShortcut(4, { ...ctrl, key: '-' })).toBe(3)
    expect(
      applyRoughStoryboardZoomShortcut(4, {
        key: '+',
        ctrlKey: false,
        metaKey: false,
      }),
    ).toBeNull()
    expect(applyRoughStoryboardZoomShortcut(4, { ...ctrl, key: '0' })).toBeNull()
  })

  it('최소·최대에서 더 내려가거나 올라가지 않는다', () => {
    expect(applyRoughStoryboardZoomShortcut(1, { ...ctrl, key: '-' })).toBe(1)
    expect(applyRoughStoryboardZoomShortcut(6, { ...command, key: '+' })).toBe(6)
  })
})
