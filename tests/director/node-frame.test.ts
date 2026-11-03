// Director 노드 카드의 테두리(오래됨 · 고름)와 머리 단추(편집 · 가지 · 지우기)가 마우스 · 키보드 어느 쪽에서도 제대로 보이는지 검사한다 (검토 B 2026-11-03)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nodeFrameBorder } from '@/features/director/canvas-meta'

const baseNode = () => readFileSync('src/features/director/canvas-nodes/BaseNode.tsx', 'utf8')

describe('노드 카드', () => {
  // 왜: 검토 B B4 — 다시 만들어야 하는 오래된 노드의 빨간 테두리가 마우스를 올리면 회색으로 바뀌어 경고가 사라졌다.
  it('오래된 노드의 빨간 테두리는 마우스를 올려도 · 골라도 남는다', () => {
    expect(nodeFrameBorder({ strongStale: true, selected: false })).toBe('border-destructive')
    expect(nodeFrameBorder({ strongStale: true, selected: true })).toBe('border-destructive')
    expect(nodeFrameBorder({ strongStale: false, selected: true })).toBe('border-stage')
    expect(nodeFrameBorder({ strongStale: false, selected: false })).toBe('border-transparent hover:border-border')
    expect(baseNode()).toMatch(/nodeFrameBorder\(\{ strongStale, selected \}\)/)
  })

  // 왜: 검토 B B3 — 머리 단추가 마우스를 올릴 때만 생겨 키보드 · 터치로는 닿지 않았다. 예전처럼 늘 자리에 두고 보이게만 바꾼다.
  it('노드 머리의 편집 · 가지 · 지우기 단추는 Tab 으로 옮겨 가면 닿고 보인다', () => {
    expect(baseNode()).not.toMatch(/hidden items-center gap-0\.5 group-hover:flex/)
    expect(baseNode()).toMatch(/"flex items-center gap-0\.5 opacity-0[^"]*group-hover:opacity-100[^"]*group-focus-within:opacity-100/)
  })
})
