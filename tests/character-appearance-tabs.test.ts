import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// #g4 3단계 (2026-08-27) — Artist 카드 안에서 모습을 갈아끼운다.
//
// 오너 질문: "artist 기준으로 '젊은옥화' 카드가 추가되거나 아니면 옥화쪽 카드가 그룹화가
//   되거나 그런식이려나?" → 그룹화가 맞다.
//
// 카드를 나누면 "이 둘이 같은 사람"이라는 정보가 화면에서 사라진다. 실제로 지금 그 상태였고
//   (옥화/젊은 옥화가 별도 카드), 그래서 플래시백에 현재 옥화가 나오는 G4 증상이 생겼다.

const panel = readFileSync('src/features/artist/character-panel.tsx', 'utf8')
const store = readFileSync('src/stores/artist-store.ts', 'utf8')
const types = readFileSync('src/types/asset.ts', 'utf8')

describe('모습 탭 — 카드 하나 안에서 시절을 고른다', () => {
  it('모습이 하나뿐이면 탭을 그리지 않는다 — 기존 카드와 똑같이 보인다', () => {
    // 이 조건이 없으면 캐릭터 161명 전부에게 의미 없는 탭 하나가 붙는다
    expect(panel).toContain('(char.appearances?.length ?? 0) > 1')
  })

  it('고른 모습의 시트를 보여준다', () => {
    expect(panel).toContain('shownSheet')
    // 고른 게 없으면 기본 모습, 그것도 없으면 기존 view_main 으로 떨어진다
    expect(panel).toMatch(/list\.find\(\(a\) => a\.isDefault\)/)
  })

  it('탭 클릭이 카드 선택으로 새지 않는다', () => {
    // 카드 전체가 클릭 가능하므로 stopPropagation 이 없으면 탭을 누를 때 카드가 선택된다
    expect(panel).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/)
  })

  it('캐릭터별로 고른 모습을 따로 기억한다', () => {
    // 하나의 문자열로 두면 옥화에서 고른 게 강이에게도 적용된다
    expect(panel).toContain('Record<string, string>')
    expect(panel).toContain('[char.characterId]: ap.appearanceKey')
  })
})

describe('모습 데이터가 카드까지 온다', () => {
  it('스토어가 character_appearances 를 읽는다', () => {
    expect(store).toContain("from('character_appearances')")
    // 기본 모습이 먼저 오게 정렬 — 탭 순서가 매번 달라지면 안 된다
    expect(store).toContain("order('is_default', { ascending: false })")
  })

  it('캐릭터별로 묶어 넘긴다', () => {
    expect(store).toContain('appearancesByChar')
    expect(store).toContain('appearances: appearancesByChar.get')
  })

  it('타입에 서사 시점(era)이 있다 — 플래시백 자동 선택의 근거', () => {
    expect(types).toContain('era: string | null')
    // 씬의 time_of_day(하루 중 시각)와 다른 축이라는 것이 주석에 남아야 한다
    expect(types).toMatch(/time_of_day|하루 중 시각/)
  })
})
