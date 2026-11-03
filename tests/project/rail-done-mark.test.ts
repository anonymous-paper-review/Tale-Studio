// 왼쪽 레일에서 끝낸 단계에 체크가 붙고, 지금 보는 단계 · 아직 안 연 단계는 체크 없이 보이는지 검사한다 (2026-11-03 v3 디자인)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { railStageState } from '@/lib/stage-rail'
import type { StageId } from '@/types'

const ORDER: StageId[] = ['entry', 'producer', 'artist', 'writer', 'director', 'editor']
const states = (active: StageId, reached: StageId) => ORDER.map((stage) => railStageState(stage, { active, reached }))

describe('왼쪽 레일 단계 칸', () => {
  it('지금 보고 있는 단계는 체크 없이 지금 단계로 보인다', () => {
    // 왜: v3 시안 — 지금 단계 칸은 밝은 바탕 · 단계 색 아이콘이고 체크가 없다(체크는 끝낸 단계만).
    expect(railStageState('artist', { active: 'artist', reached: 'artist' })).toBe('current')
  })

  it('지금까지 연 가장 먼 단계보다 앞의 단계에는 끝낸 단계 체크를 단다', () => {
    // 왜: v3 시안 A5 — Artist 에 있으면 Producer · Writer 에 체크가 붙는다. 넘어간 단계는 잠금이 아니라 "완료"다(리뉴얼 1차).
    expect(states('artist', 'artist')).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming'])
  })

  it('앞 단계로 돌아가 보고 있어도 이미 넘어간 단계의 체크는 그대로 남는다', () => {
    // 왜: Storyboard 까지 갔다가 Writer 를 다시 열어도 끝낸 일은 끝낸 일이다 — 보는 화면에 따라 체크가 사라지면 진행이 되돌아간 것처럼 보인다.
    expect(states('producer', 'writer')).toEqual(['done', 'current', 'done', 'open', 'upcoming', 'upcoming'])
  })

  it('지금까지 연 가장 먼 단계는 열려 있어도 체크를 달지 않는다', () => {
    // 왜: 가장 먼 단계는 아직 하는 중이다 — 앞 단계를 보는 동안에도 끝냈다고 표시하지 않는다.
    expect(railStageState('artist', { active: 'entry', reached: 'artist' })).toBe('open')
  })

  it('아직 열지 않은 단계는 체크 없이 아직 안 연 단계로 보인다', () => {
    // 왜: 새 프로젝트는 Producer 만 열려 있다 — 다음 단계들은 흐린 칸이다.
    expect(states('entry', 'entry')).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
  })

  it('사이드바는 이 규칙으로 끝낸 단계 체크를 그리고, 지금 단계 아이콘에 그 단계 색을 쓴다', () => {
    // 왜: 규칙만 있고 레일이 다른 판정을 쓰면 체크가 엉뚱한 칸에 붙는다. 단계 색은 화면 이름 기준(data-stage)이어야 Writer 칸이 Writer 색이다.
    const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')
    expect(sidebar).toMatch(/railStageState\(stage\.id, \{/)
    expect(sidebar).toMatch(/railState === 'done'[\s\S]{0,400}data-testid="rail-done-check"/)
    expect(sidebar).toMatch(/data-stage=\{STAGE_PERSONA\[stage\.id\]\}/)
  })
})
