import { describe, it, expect } from 'vitest'
import {
  planShotCharacterRefs,
  readCharacterBlocking,
  missingSheetsMessage,
  pairKey,
  stripUrlQuery,
  type ReferenceLookup,
} from '@/lib/director/shot-references'

// #ref-gate(2026-09-02, 실측 겨울_4 9ea9bd67): 실사 스토리보드의 인물 참조는 서버 진실로 계획한다 —
//   시트 없는 인물은 빠지는 게 아니라 "빠졌다"고 돌려주고, 순서는 결정적이며, 인형↔인물 단서(위치·포즈)를 싣는다.

function lookup(overrides: Partial<ReferenceLookup> = {}): ReferenceLookup {
  return {
    characterById: new Map([
      ['char', { name: '용족 수장' }],
      ['char_2', { name: '요정 수장' }],
      ['char_3', { name: '수인 수장' }],
    ]),
    sheetByPair: new Map<string, string | null>([
      [pairKey('char', 'current'), 'https://x/characters/char_main.png?v=1'],
      [pairKey('char_2', 'current'), 'https://x/characters/char_2_main.png?v=2'],
      [pairKey('char_3', 'current'), null],
    ]),
    defaultKeyById: new Map([
      ['char', 'current'],
      ['char_2', 'current'],
      ['char_3', 'current'],
    ]),
    ...overrides,
  }
}

const blocking = {
  character_blocking: [
    { character_id: 'char_3', position_in_frame: 'right_third', pose: 'lying motionless on a mound' },
    { character_id: 'char', position_in_frame: 'left_third', pose: 'standing tall' },
  ],
}

describe('planShotCharacterRefs', () => {
  it('시트 없는 인물은 missing 으로 돌려주고, 있는 인물만 결정적 순서(characterId 오름차순)로 참조에 넣는다', () => {
    const plan = planShotCharacterRefs(
      { shot_id: 'sh_01_24', characters: ['char_3', 'char', 'char_2'], character_appearance_keys: { char: 'current', char_2: 'current', char_3: 'current' }, static_spec: blocking },
      lookup(),
    )
    expect(plan.characterRefs.map((r) => r.characterId)).toEqual(['char', 'char_2'])
    expect(plan.missing).toEqual([{ characterId: 'char_3', appearanceKey: 'current', name: '수인 수장' }])
  })

  it('러프 character_blocking 의 위치·포즈를 인물 참조에 싣는다(없으면 null)', () => {
    const plan = planShotCharacterRefs(
      { shot_id: 's', characters: ['char', 'char_2'], character_appearance_keys: { char: 'current', char_2: 'current' }, static_spec: blocking },
      lookup(),
    )
    expect(plan.characterRefs[0]).toMatchObject({ characterId: 'char', name: '용족 수장', position: 'left_third', pose: 'standing tall' })
    expect(plan.characterRefs[1]).toMatchObject({ characterId: 'char_2', position: null, pose: null })
  })

  it('character_appearance_keys 가 없는 레거시 샷은 기본 모습 키로 폴백한다', () => {
    const plan = planShotCharacterRefs({ shot_id: 's', characters: ['char'], character_appearance_keys: null }, lookup())
    expect(plan.characterRefs).toHaveLength(1)
    expect(plan.characterRefs[0].appearanceKey).toBe('current')
  })

  it('characters 가 배열이 아니면(미정의) 빈 계획 — 호출부가 종전 경로로 간다', () => {
    expect(planShotCharacterRefs({ shot_id: 's', characters: undefined }, lookup())).toEqual({ characterRefs: [], missing: [] })
    expect(planShotCharacterRefs({ shot_id: 's', characters: null }, lookup())).toEqual({ characterRefs: [], missing: [] })
  })

  it('빈 배열(인물 없는 샷)은 참조도 missing 도 없다', () => {
    expect(planShotCharacterRefs({ shot_id: 's', characters: [] }, lookup())).toEqual({ characterRefs: [], missing: [] })
  })

  it('characters 표에 없는 id 는 이름 대신 id 로 missing 에 잡힌다(소리 없이 빠지지 않는다)', () => {
    const plan = planShotCharacterRefs({ shot_id: 's', characters: ['ghost'] }, lookup())
    expect(plan.missing).toEqual([{ characterId: 'ghost', appearanceKey: 'current', name: 'ghost' }])
  })

  it('missingSheetsMessage 는 이름을 나열한다', () => {
    expect(missingSheetsMessage([{ characterId: 'a', appearanceKey: 'current', name: '요정 수장' }, { characterId: 'b', appearanceKey: 'current', name: '수인 수장' }]))
      .toBe('Character sheets are missing for 요정 수장, 수인 수장 — generate them in the Artist tab first.')
  })
})

describe('readCharacterBlocking / stripUrlQuery', () => {
  it('블로킹 배열을 character_id 맵으로 — 비문자열·빈값은 null, 중복 id 는 첫 항목', () => {
    const m = readCharacterBlocking({
      character_blocking: [
        { character_id: 'a', position_in_frame: ' center_third ', pose: '' },
        { character_id: 'a', position_in_frame: 'left_third' },
        { character_id: 42 },
      ],
    })
    expect(m.get('a')).toEqual({ position: 'center_third', pose: null })
    expect(m.size).toBe(1)
    expect(readCharacterBlocking(null).size).toBe(0)
  })

  it('캐시버스트 쿼리를 떼고 같은 객체를 판정한다', () => {
    expect(stripUrlQuery('https://x/a.png?v=123')).toBe('https://x/a.png')
    expect(stripUrlQuery('https://x/a.png')).toBe('https://x/a.png')
  })
})
