// 단계 확인 단추가 지금 단계에서 다음 단계로 넘어가자는 말과 그 단계 아이콘을 쓰고, 누르면 넘기기 · 더 고치기로 가는지 검사한다 (11/5 Figma Control/Stage Confirm)
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { StageConfirm, stageConfirmNext } from '@/components/controls/stage-confirm'
import type { StageId } from '@/types'

const STAGES: StageId[] = ['entry', 'producer', 'artist', 'writer', 'director', 'editor']
const html = (stage: StageId) => renderToStaticMarkup(createElement(StageConfirm, { stage, onConfirm: () => {}, onRevise: () => {} }))
type Element = ReactElement<Record<string, unknown>>
const elements = (node: ReactNode): Element[] =>
  Array.isArray(node) ? node.flatMap(elements) : isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : []

describe('단계 확인 단추', () => {
  // 왜: 11/5 시안 P2 — 단계를 넘길지 묻는 자리에 한 쌍의 단추를 둔다. 왼쪽은 다음 단계에서 하는 일로 말한다.
  it('단계 확인 단추는 지금 단계에서 다음 단계로 가자는 말을 쓴다', () => {
    expect(html('entry')).toContain('좋아요, 산문 쓰기로')
    expect(html('producer')).toContain('좋아요, 그림 그리기로')
    expect(html('artist')).toContain('좋아요, 콘티 짜기로')
    expect(html('writer')).toContain('좋아요, 연출하기로')
    expect(html('director')).toContain('좋아요, 편집하기로')
    expect(html('editor')).toContain('좋아요, 완성하기')
    for (const stage of STAGES) expect(html(stage), stage).toContain('아니요, 더 고칠래요')
  })

  // 왜: 시안의 왼쪽 단추 아이콘은 넘어갈 단계의 아이콘이다(마지막 Editor 다음은 작품 완성 · 내보내기).
  it('단계 확인 단추의 왼쪽 단추는 다음 단계를 가리킨다(Editor 다음은 작품 완성)', () => {
    expect(STAGES.map(stageConfirmNext)).toEqual(['writer', 'artist', 'storyboard', 'director', 'editor', 'complete'])
    expect(html('entry')).toMatch(/data-next="writer"/)
    expect(html('editor')).toMatch(/data-next="complete"/)
  })

  // 왜: 정상 경로 고정 — 왼쪽은 넘기기, 오른쪽은 더 고치기다. 둘을 바꿔 달면 넘기려던 사람이 고치기로 간다.
  it('왼쪽 단추를 누르면 넘기고, 오른쪽 단추를 누르면 더 고친다', () => {
    const onConfirm = vi.fn()
    const onRevise = vi.fn()
    const buttons = elements(StageConfirm({ stage: 'entry', onConfirm, onRevise })).filter((node) => node.type === 'button')
    expect(buttons).toHaveLength(2)
    ;(buttons[0].props.onClick as () => void)()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    ;(buttons[1].props.onClick as () => void)()
    expect(onRevise).toHaveBeenCalledTimes(1)
  })
})
