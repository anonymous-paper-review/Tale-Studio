// 왼쪽 레일이 Producer · Writer · Artist · Camera · Director · Editor 여섯 칸이고, Writer 칸이 씬 스토리 · 콘티를 함께 맡는지(누르기 · Alt 숫자 · 움직임 · 숫자 배지 · 이름) 검사한다 (D1 오너 2026-11-22)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STAGES, STAGE_AGENT_NAME, STAGE_LABEL } from '@/lib/constants'
import { RAIL_ITEMS, railItemBadge, railStageState, railTarget } from '@/lib/stage-rail'
import { STAGE_ACCESS_KEY, stageForShortcut } from '@/lib/stage-shortcuts'
import { slideDirectionBetween, stageIndexFromPathname } from '@/lib/stage-transition'
import { projectStageLabel } from '@/lib/project/open-path'
import type { StageId } from '@/types'

const alt = (key: string) => stageForShortcut({ code: `Digit${key}`, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })
const can = (open: StageId[]) => (stage: StageId) => open.includes(stage)

describe('레일 칸', () => {
  it('왼쪽 레일에는 Producer · Writer · Artist · Camera · Director · Editor 칸만 있고 Storyboard 칸은 없다', () => {
    // 왜: D1 — Storyboard 는 Writer 탭 안의 콘티가 됐다(리드 단계 구조). 단계(id)는 일곱이지만 레일 칸은 여섯이다.
    expect(RAIL_ITEMS.map((item) => STAGE_LABEL[item.id])).toEqual(['Producer', 'Writer', 'Artist', 'Camera', 'Director', 'Editor'])
    expect(RAIL_ITEMS.find((item) => item.id === 'producer')?.stages).toEqual(['producer', 'writer'])
    // 모든 단계가 꼭 한 칸에 든다 — 새 단계를 칸 표에 빠뜨리면 레일에서 사라진다.
    const placed = RAIL_ITEMS.flatMap((item) => item.stages)
    expect([...placed].sort()).toEqual(STAGES.map((s) => s.id).sort())
  })

  it('씬 스토리 화면이나 콘티 화면을 보고 있으면 레일의 Writer 칸이 지금 단계로 보인다', () => {
    // 왜: D1 — 두 화면 모두 Writer 탭이다. 콘티를 볼 때 레일이 다른 칸(옛 Storyboard)을 가리키면 어디 있는지 헷갈린다.
    expect(railStageState('producer', { active: 'writer', reached: 'writer' })).toBe('current')
    expect(railStageState('producer', { active: 'producer', reached: 'writer' })).toBe('current')
  })

  it('레일 Writer 칸이나 Alt+2 를 누르면 콘티가 열려 있으면 콘티로, 아니면 씬 스토리로 간다', () => {
    // 왜(혼자 정한 것 a): 콘티가 열리면 산문은 잠겨 읽기만 하고 할 일은 콘티에 있다. 씬 스토리는 위 막대 [씬 스토리]로 간다.
    expect(railTarget('producer', can(['entry', 'producer', 'artist', 'writer']))).toBe('writer')
    expect(railTarget('producer', can(['entry', 'producer', 'artist']))).toBe('producer')
    expect(railTarget('artist', can(['entry', 'producer', 'artist']))).toBe('artist')
    const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')
    expect(sidebar).toMatch(/goToRailItem\(stage\.id\)/)
    expect(sidebar).toMatch(/goToRailItem\(target\)/)
  })

  it('Alt 숫자는 레일 칸 순서다 — 1 Producer · 2 Writer · 3 Artist · 4 Camera · 5 Director · 6 Editor', () => {
    // 왜(혼자 정한 것 c): 숫자가 레일 칸과 맞아야 외울 수 있다. 콘티는 Writer 칸 안이라 Alt+2 로 간다.
    expect(RAIL_ITEMS.map((item) => STAGE_ACCESS_KEY[item.id])).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(alt('2')).toBe('producer')
  })

  it('단계를 옮길 때의 세로 움직임은 레일 칸 순서를 따른다 — Artist 에서 콘티로 가면 위로, 콘티에서 Camera 로 가면 아래로 움직이고, 씬 스토리 · 콘티 사이는 세로로 움직이지 않는다', () => {
    // 왜(혼자 정한 것 d): 화면 움직임은 레일에서 칸이 옮겨 가는 쪽을 따라야 한다 — 콘티는 레일에서 Artist 위(Writer 칸)에 있다.
    const at = (path: string) => stageIndexFromPathname(path)
    expect(at('/studio/writer')).toBe(at('/studio/producer'))
    expect(slideDirectionBetween(at('/studio/artist'), at('/studio/writer'))).toBe('back')
    expect(slideDirectionBetween(at('/studio/writer'), at('/studio/camera'))).toBe('forward')
    expect(slideDirectionBetween(at('/studio/producer'), at('/studio/writer'))).toBe('none')
  })

  it('레일 Writer 칸의 완료 숫자는 씬 스토리 · 콘티 숫자를 합친다', () => {
    // 왜(혼자 정한 것 k): 칸이 하나라 숫자도 하나다 — 콘티에서 끝난 러프가 씬 스토리 숫자에 가려 사라지지 않게.
    expect(railItemBadge('producer', { producer: 1, writer: 3, artist: 2 })).toBe(4)
    expect(railItemBadge('artist', { producer: 1, writer: 3, artist: 2 })).toBe(2)
    expect(railItemBadge('camera', {})).toBe(0)
  })

  it('콘티(단계 id writer)의 이름표는 Writer 다 — 위 막대 칩 · 목록 이름표 · 채팅 구역 머리 · 진행 알림', () => {
    // 왜(혼자 정한 것 j): 레일과 같은 이름이어야 한다. 콘티라는 칸 이름은 Writer 위 막대 [씬 스토리 | 콘티]가 보여 준다.
    expect(STAGE_LABEL.writer).toBe('Writer')
    expect(STAGE_AGENT_NAME.writer).toBe('Writer')
    expect(projectStageLabel('writer')).toBe('Writer')
  })
})
