// 채팅 stage 구간 분할 (#chat-continuity 2026-07-31) — 채팅방은 프로젝트당 하나이고
//   탭 이동은 "새 방"이 아니라 같은 스레드의 새 챕터임을 UI 가 보여줄 수 있게 하는 계산.
import { describe, expect, it } from 'vitest'
import { buildChatSections } from '@/lib/chat-sections'
import type { StageId } from '@/types'

const m = (stage: StageId, content: string) => ({ stage, content })

describe('buildChatSections', () => {
  it('연속된 같은 stage 메시지는 한 구간으로 묶는다', () => {
    const sections = buildChatSections(
      [m('producer', 'a'), m('producer', 'b'), m('writer', 'c')],
      'writer',
    )
    expect(sections.map((s) => s.stage)).toEqual(['producer', 'writer'])
    expect(sections[0].messages.map((x) => x.content)).toEqual(['a', 'b'])
  })

  it('되돌아온 stage 는 새 구간이다 — 시간순이 진실', () => {
    const sections = buildChatSections(
      [m('producer', 'a'), m('writer', 'b'), m('producer', 'c')],
      'producer',
    )
    expect(sections.map((s) => s.stage)).toEqual(['producer', 'writer', 'producer'])
    expect(sections[2].messages.map((x) => x.content)).toEqual(['c'])
  })

  it('발화 없는 stage 로 이동하면 빈 현재 구간을 끝에 만든다', () => {
    const sections = buildChatSections([m('producer', 'a')], 'director')
    expect(sections).toHaveLength(2)
    expect(sections[1]).toMatchObject({ stage: 'director', messages: [], current: true })
  })

  it('마지막 구간이 현재 stage 면 빈 구간을 덧붙이지 않는다', () => {
    const sections = buildChatSections([m('producer', 'a'), m('writer', 'b')], 'writer')
    expect(sections).toHaveLength(2)
    expect(sections[1].current).toBe(true)
    expect(sections[1].messages).toHaveLength(1)
  })

  it('current 는 마지막 구간에만 붙는다 (같은 stage 가 앞에 또 있어도)', () => {
    const sections = buildChatSections(
      [m('writer', 'a'), m('artist', 'b'), m('writer', 'c')],
      'writer',
    )
    expect(sections.map((s) => s.current)).toEqual([false, false, true])
  })

  it('메시지가 하나도 없어도 현재 stage 구간 하나를 돌려준다', () => {
    expect(buildChatSections([], 'producer')).toEqual([
      { stage: 'producer', messages: [], current: true },
    ])
  })

  it('입력 배열을 변형하지 않는다', () => {
    const input = [m('producer', 'a'), m('writer', 'b')]
    const copy = structuredClone(input)
    buildChatSections(input, 'artist')
    expect(input).toEqual(copy)
  })
})
