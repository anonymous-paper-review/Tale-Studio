// 확대·축소 단축키를 눌러도 화면 크기를 정해진 범위 안에서 한 단계씩 바꾼다
import { describe, expect, it } from 'vitest'
import { applyRoughStoryboardZoomShortcut } from '@/features/writer/rough-storyboard-view'

const ctrl = { ctrlKey: true, metaKey: false }
const command = { ctrlKey: false, metaKey: true }

describe('applyRoughStoryboardZoomShortcut', () => {
  it('Ctrl/Command와 + 또는 -를 함께 누를 때만 화면 크기를 한 단계 바꾼다', () => {
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
