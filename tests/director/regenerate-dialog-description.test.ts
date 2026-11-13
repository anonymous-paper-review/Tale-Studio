// 다시 만들기 확인 창의 설명 — 빈 설명 줄을 그리지 않고, 설명 줄이 없으면 본문 첫 줄이 (화면 읽기에도) 설명이 된다 (리드 11/14)
import { describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

vi.mock('@/lib/i18n', async (original) => ({ ...await original<typeof import('@/lib/i18n')>(), useT: () => (key: string) => key }))

import { RegenerateConfirmDialog } from '@/features/director/regenerate-confirm-dialog'
import { DialogContent, DialogDescription } from '@/components/ui/dialog'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : ''
}
const VERSION_LINE = '새 이미지가 지금 이미지가 되고, 지금 이미지는 버전으로 남아요.'
const dialog = (description: string, impact: string[]) =>
  elements(RegenerateConfirmDialog({ open: true, onOpenChange: () => {}, title: '이미지를 다시 만들까요?', description, impact, confirmLabel: '다시 만들기', onConfirm: () => {} }))
const descriptions = (nodes: Element[]) => nodes.filter((node) => node.type === DialogDescription)
const listLines = (nodes: Element[]) => nodes.filter((node) => node.type === 'li').map(textOf)

describe('같이 정한 것', () => {
  it('설명 줄이 빈 확인 창은 빈 설명을 그리지 않고, 본문 줄("새 이미지가 지금 이미지가 되고 …")을 설명으로 잇는다', () => {
    // 왜: 검토 a 참고(리드 11/14) — d39f7d11 이 샷 상세 확인 창의 설명을 비워, 빈 설명 줄이 그려지고 화면 읽기에는 설명이 빈 창이었다.
    const nodes = dialog('', [VERSION_LINE])

    expect(descriptions(nodes).map((node) => textOf(node.props.children as ReactNode))).toEqual([VERSION_LINE])
    // 같은 줄을 목록에 한 번 더 그리지 않는다.
    expect(listLines(nodes)).toEqual([])
  })
})

describe('혼자 정한 것', () => {
  it('설명 줄이 있는 확인 창은 지금처럼 설명 아래에 바뀌는 것 목록을 둔다', () => {
    // 왜: 정상 경로 고정 — 툴바 · 카드 · 꼬리 확인 창은 설명 한 줄과 바뀌는 것 목록을 따로 보인다.
    const nodes = dialog('고른 샷 1개의 이미지를 다시 만들어요. Takes 는 쓰지 않아요.', [VERSION_LINE])

    expect(descriptions(nodes).map((node) => textOf(node.props.children as ReactNode))).toEqual(['고른 샷 1개의 이미지를 다시 만들어요. Takes 는 쓰지 않아요.'])
    expect(listLines(nodes)).toEqual([VERSION_LINE])
  })

  it('설명도 바뀌는 것도 없는 확인 창은 설명을 그리지 않고 화면 읽기 설명 연결도 걸지 않는다', () => {
    // 왜: 빈 설명을 가리키는 연결이 남으면 화면 읽기가 빈 설명을 읽는다(aria-describedby 정리) — 지금 이런 창은 없지만 같은 규칙.
    const nodes = dialog('', [])

    expect(descriptions(nodes)).toEqual([])
    const content = nodes.find((node) => node.type === DialogContent)!
    expect(Object.hasOwn(content.props, 'aria-describedby')).toBe(true)
    expect(content.props['aria-describedby']).toBeUndefined()
  })
})
