// 왼쪽 레일이 Producer · Writer · Artist · Storyboard · Director · Editor 여섯 칸 그대로이고, Writer 칸이 씬 스토리 · 콘티를 함께 맡는지(누르기 · Alt 숫자 · 움직임 · 숫자 배지 · 이름) 검사한다 (오너 2026-11-26 O1, 리드 구조 C)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STAGES, STAGE_LABEL } from '@/lib/constants'
import { RAIL_ITEMS, railItemBadge, railStageState, railTarget } from '@/lib/stage-rail'
import { STAGE_ACCESS_KEY, stageForShortcut } from '@/lib/stage-shortcuts'
import { slideDirectionBetween, stageIndexFromPathname } from '@/lib/stage-transition'
import { projectStageLabel } from '@/lib/project/open-path'
import type { StageId } from '@/types'

const alt = (key: string) => stageForShortcut({ code: `Digit${key}`, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })
const can = (open: StageId[]) => (stage: StageId) => open.includes(stage)

describe('레일 칸', () => {
  // 왜: O1 — 레일은 지금과 같은 여섯 칸이고, 콘티는 Writer 칸 안의 두 번째 칸이다. 단계(id)는 일곱이지만 레일 칸은 여섯이다.
  it('왼쪽 레일은 Producer · Writer · Artist · Storyboard · Director · Editor 여섯 칸이고 Writer 칸이 씬 스토리와 콘티를 함께 맡는다', () => {
    expect(RAIL_ITEMS.map((item) => STAGE_LABEL[item.id])).toEqual(['Producer', 'Writer', 'Artist', 'Storyboard', 'Director', 'Editor'])
    expect(RAIL_ITEMS.find((item) => item.id === 'producer')?.stages).toEqual(['producer', 'conti'])
    // 모든 단계가 꼭 한 칸에 든다 — 새 단계를 칸 표에 빠뜨리면 레일에서 사라진다.
    expect(RAIL_ITEMS.flatMap((item) => item.stages).sort()).toEqual(STAGES.map((s) => s.id).sort())
  })

  // 왜: O1 — 두 화면 모두 Writer 다. 콘티를 볼 때 레일이 다른 칸을 가리키면 어디 있는지 헷갈린다.
  it('씬 스토리 화면이나 콘티 화면을 보고 있으면 레일의 Writer 칸이 지금 단계로 보인다', () => {
    expect(railStageState('producer', { active: 'conti', reached: 'conti' })).toBe('current')
    expect(railStageState('producer', { active: 'producer', reached: 'conti' })).toBe('current')
  })

  // 왜(혼자 정한 것): 콘티가 열리면 산문은 잠겨 읽기만 하고 할 일은 콘티에 있다. 씬 스토리는 위 막대 [씬 스토리]로 간다.
  it('레일 Writer 칸이나 Alt+2 를 누르면 콘티가 열려 있으면 콘티로, 아니면 씬 스토리로 간다', () => {
    expect(railTarget('producer', can(['entry', 'producer', 'conti']))).toBe('conti')
    expect(railTarget('producer', can(['entry', 'producer']))).toBe('producer')
    expect(railTarget('artist', can(['entry', 'producer', 'conti', 'artist']))).toBe('artist')
    const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')
    expect(sidebar).toMatch(/goToRailItem\(stage\.id\)/)
    expect(sidebar).toMatch(/goToRailItem\(target\)/)
  })

  // 왜(혼자 정한 것): Writer 칸의 일(씬 스토리 · 콘티)이 끝나 Artist 로 넘어가야 끝낸 칸이다 — 콘티에 있는 동안은 아직 하는 칸.
  it('Writer 칸은 Artist 가 열려야 끝낸 칸(체크)이고 콘티까지만 열렸으면 아직 하는 칸이다', () => {
    expect(railStageState('producer', { active: null, reached: 'conti' })).toBe('open')
    expect(railStageState('producer', { active: null, reached: 'artist' })).toBe('done')
  })

  // 왜(혼자 정한 것): 숫자가 레일 칸과 맞아야 외울 수 있다(지금 숫자 그대로). 콘티는 Writer 칸 안이라 따로 숫자가 없고 Alt+2 로 간다.
  it('Alt 숫자는 레일 칸 순서다 — 1 Producer · 2 Writer · 3 Artist · 4 Storyboard · 5 Director · 6 Editor', () => {
    expect(RAIL_ITEMS.map((item) => STAGE_ACCESS_KEY[item.id])).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(STAGE_ACCESS_KEY.conti).toBe('')
    expect(alt('2')).toBe('producer')
    expect(alt('4')).toBe('writer')
  })

  // 왜(혼자 정한 것): 화면 움직임은 레일에서 칸이 옮겨 가는 쪽을 따라야 한다 — 콘티는 레일에서 Artist 위(Writer 칸)에 있다.
  it('단계를 옮길 때의 세로 움직임은 레일 칸 순서를 따르고 씬 스토리 · 콘티 사이는 세로로 움직이지 않는다', () => {
    const at = (path: string) => stageIndexFromPathname(path)
    expect(at('/studio/conti')).toBe(at('/studio/producer'))
    expect(slideDirectionBetween(at('/studio/conti'), at('/studio/artist'))).toBe('forward')
    expect(slideDirectionBetween(at('/studio/artist'), at('/studio/conti'))).toBe('back')
    expect(slideDirectionBetween(at('/studio/producer'), at('/studio/conti'))).toBe('none')
    expect(slideDirectionBetween(at('/studio/artist'), at('/studio/writer'))).toBe('forward')
  })

  // 왜(혼자 정한 것): 칸이 하나라 숫자도 하나다 — 콘티에서 끝난 러프가 씬 스토리 숫자에 가려 사라지지 않게.
  it('레일 Writer 칸의 완료 숫자는 씬 스토리 · 콘티 숫자를 합친다', () => {
    expect(railItemBadge('producer', { producer: 1, conti: 3, artist: 2 })).toBe(4)
    expect(railItemBadge('artist', { producer: 1, conti: 3, artist: 2 })).toBe(2)
    expect(railItemBadge('writer', {})).toBe(0)
  })

  // 왜(혼자 정한 것): 홈 목록 · 위 막대 칩 · 채팅 구역 머리가 레일과 같은 이름이어야 한다. "콘티"라는 칸 이름은 위 막대 [씬 스토리 | 콘티]가 보여 준다.
  it('콘티 단계 프로젝트의 목록 이름표는 Writer 다', () => {
    expect(projectStageLabel('conti')).toBe('Writer')
    expect(projectStageLabel('writer')).toBe('Storyboard')
  })
})
