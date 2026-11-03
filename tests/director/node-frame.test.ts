// Director 노드 카드의 테두리(오래됨 · 고름)와 머리 단추(편집 · 가지 · 복제 · 지우기)가 마우스 · 키보드 · 터치 어느 쪽에서도 제대로 보이는지 검사한다 (검토 B · C 2026-11-03)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({ Handle: () => null, Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' } }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { nodeFrameBorder } from '@/features/director/canvas-meta'
import { BaseNode } from '@/features/director/canvas-nodes/BaseNode'

const baseNode = () => readFileSync('src/features/director/canvas-nodes/BaseNode.tsx', 'utf8')
/** 영상 노드 하나(머리 오른쪽에 ★ 단추가 있는 노드)를 그린다. */
const videoNode = () =>
  renderToStaticMarkup(createElement(BaseNode, {
    id: 'video-1', theme: 'video', title: 'Shot 1', canBranch: true,
    headerExtra: createElement('button', { type: 'button', 'aria-label': 'Mark Final' }, '★'),
  }))
/** 머리 단추 묶음의 class 낱말들. */
const buttonGroup = () => {
  const match = videoNode().match(/<div class="([^"]*)"><button[^>]*aria-label="노드 편집"/)
  return new Set((match?.[1] ?? '').split(/\s+/))
}

describe('노드 카드', () => {
  // 왜: 검토 B B4 — 다시 만들어야 하는 오래된 노드의 빨간 테두리가 마우스를 올리면 회색으로 바뀌어 경고가 사라졌다.
  it('오래된 노드의 빨간 테두리는 마우스를 올려도 · 골라도 남는다', () => {
    expect(nodeFrameBorder({ strongStale: true, selected: false })).toBe('border-destructive')
    expect(nodeFrameBorder({ strongStale: true, selected: true })).toBe('border-destructive')
    expect(nodeFrameBorder({ strongStale: false, selected: true })).toBe('border-stage')
    expect(nodeFrameBorder({ strongStale: false, selected: false })).toBe('border-transparent hover:border-border')
    expect(baseNode()).toMatch(/nodeFrameBorder\(\{ strongStale, selected \}\)/)
  })

  // 왜: 검토 B B3 — 머리 단추가 마우스를 올릴 때만 생겨(display 없음) 키보드로는 닿지 않았다. 늘 그려 두고 Tab 으로 옮겨 가면 보인다.
  it('노드 머리의 편집 · 가지 · 지우기 단추는 Tab 으로 옮겨 가면 닿고 보인다', () => {
    const group = buttonGroup()
    expect(group.has('hidden')).toBe(false)
    for (const word of ['group-focus-within:w-auto', 'group-focus-within:opacity-100', 'group-focus-within:pointer-events-auto']) expect(group.has(word), word).toBe(true)
  })

  // 왜: 검토 C — 보이지 않는 단추가 자리를 차지해 영상 노드의 ★ 가 ··· 에서 떨어졌고, 터치로 ··· 를 누르면 밑의 지우기 단추가 눌려 확인 창이 떴다.
  it('가만히 있을 때 노드 머리의 단추는 자리를 차지하지 않고 눌리지도 않는다', () => {
    const group = buttonGroup()
    for (const word of ['w-0', 'overflow-hidden', 'opacity-0', 'pointer-events-none', 'group-hover:w-auto', 'group-hover:pointer-events-auto']) expect(group.has(word), word).toBe(true)
    // 영상 노드의 ★ 바로 뒤가 ··· 다(그 사이에 보이지 않는 단추 자리가 없다). 단추 묶음은 ★ 왼쪽에 서서,
    //   마우스를 올리거나 터치해 단추가 보이게 돼도 ★ · ··· 자리는 그대로다 — ··· 를 누르면 단추가 아니라 노드가 눌린다.
    expect(videoNode()).toMatch(/aria-label="Mark Final">★<\/button><svg[^>]*lucide/)
    expect(videoNode()).toMatch(/aria-label="노드 삭제"[\s\S]*aria-label="Mark Final"[\s\S]*<svg[^>]*lucide/)
  })

  // 왜: 검토 C — 머리 단추의 화면 읽기 이름이 영어("Edit" · "Delete")로만 있어 한국어 화면에서 영어로 읽혔다.
  it('노드 머리 단추의 화면 읽기 이름은 화면 언어로 읽힌다', () => {
    const html = videoNode()
    for (const label of ['노드 편집', '가지 만들기', '노드 복제', '노드 삭제']) expect(html, label).toContain(`aria-label="${label}"`)
    expect(html).not.toMatch(/aria-label="(Edit|Branch|Duplicate|Delete)"/)
  })
})
