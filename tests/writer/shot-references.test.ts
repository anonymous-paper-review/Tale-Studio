// 샷에 들어갈 인물과 배경 정보를 빠짐없이 찾아, 없는 참조는 사용자에게 알려준다 (#ref-gate 2026-09-02, 실측 겨울_4 9ea9bd67)
import { describe, it, expect } from 'vitest'
import {
  planShotCharacterRefs,
  readCharacterBlocking,
  missingSheetsMessage,
  pairKey,
  resolveSceneWorldRefs,
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
  it('시트가 없는 인물은 빠졌다고 알리고, 있는 인물은 정해진 순서로 참조에 넣는다', () => {
    const plan = planShotCharacterRefs(
      { shot_id: 'sh_01_24', characters: ['char_3', 'char', 'char_2'], character_appearance_keys: { char: 'current', char_2: 'current', char_3: 'current' }, static_spec: blocking },
      lookup(),
    )
    expect(plan.characterRefs.map((r) => r.characterId)).toEqual(['char', 'char_2'])
    expect(plan.missing).toEqual([{ characterId: 'char_3', appearanceKey: 'current', name: '수인 수장' }])
  })

  it('인물의 위치와 자세를 알 수 있으면 참조에 함께 보여주고, 없으면 비워 둔다', () => {
    const plan = planShotCharacterRefs(
      { shot_id: 's', characters: ['char', 'char_2'], character_appearance_keys: { char: 'current', char_2: 'current' }, static_spec: blocking },
      lookup(),
    )
    expect(plan.characterRefs[0]).toMatchObject({ characterId: 'char', name: '용족 수장', position: 'left_third', pose: 'standing tall' })
    expect(plan.characterRefs[1]).toMatchObject({ characterId: 'char_2', position: null, pose: null })
  })

  it('모습 선택 정보가 없으면 기본 모습을 사용한다', () => {
    const plan = planShotCharacterRefs({ shot_id: 's', characters: ['char'], character_appearance_keys: null }, lookup())
    expect(plan.characterRefs).toHaveLength(1)
    expect(plan.characterRefs[0].appearanceKey).toBe('current')
  })

  it('인물 목록을 알 수 없으면 참조를 만들지 않고 기존 흐름으로 진행한다', () => {
    expect(planShotCharacterRefs({ shot_id: 's', characters: undefined }, lookup())).toEqual({ characterRefs: [], missing: [] })
    expect(planShotCharacterRefs({ shot_id: 's', characters: null }, lookup())).toEqual({ characterRefs: [], missing: [] })
  })

  it('인물이 없는 샷은 참조와 누락 알림을 만들지 않는다', () => {
    expect(planShotCharacterRefs({ shot_id: 's', characters: [] }, lookup())).toEqual({ characterRefs: [], missing: [] })
  })

  it('목록에 없는 인물은 이름 대신 그 값을 누락 알림에 넣는다', () => {
    const plan = planShotCharacterRefs({ shot_id: 's', characters: ['ghost'] }, lookup())
    expect(plan.missing).toEqual([{ characterId: 'ghost', appearanceKey: 'current', name: 'ghost' }])
  })

  it('누락된 인물의 이름을 한 문장으로 나열해 알려준다', () => {
    expect(missingSheetsMessage([{ characterId: 'a', appearanceKey: 'current', name: '요정 수장' }, { characterId: 'b', appearanceKey: 'current', name: '수인 수장' }]))
      .toBe('Character sheets are missing for 요정 수장, 수인 수장 — generate them in the Artist tab first.')
  })
})

describe('readCharacterBlocking / stripUrlQuery', () => {
  it('인물별 위치와 자세를 읽을 때 잘못된 값은 비우고, 같은 인물은 처음 정보를 사용한다', () => {
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

  it('주소 뒤의 추가 정보가 달라도 같은 그림으로 알아본다', () => {
    expect(stripUrlQuery('https://x/a.png?v=123')).toBe('https://x/a.png')
    expect(stripUrlQuery('https://x/a.png')).toBe('https://x/a.png')
  })
})

describe('resolveSceneWorldRefs (씬→배경)', () => {
  it('장면의 장소로 배경을 찾고, 없으면 장면 번호로 다시 찾아 연결한다', () => {
    const m = resolveSceneWorldRefs(
      [
        { scene_id: 'sc_01', location: 'location' },
        { scene_id: 'sc_02', location: 'missing_loc' },
        { scene_id: 'sc_03', location: null },
      ],
      [
        { location_id: 'location', scene_id: null, wide_shot: 'https://x/loc_wide.png' },
        { location_id: 'other', scene_id: 'sc_02', wide_shot: 'https://x/other_wide.png' },
        { location_id: 'empty', scene_id: 'sc_03', wide_shot: '' },
      ],
    )
    expect(m.get('sc_01')).toBe('https://x/loc_wide.png') // scenes.location 우선 (겨울_4 실측 형태: locations.scene_id 는 null)
    expect(m.get('sc_02')).toBe('https://x/other_wide.png') // 폴백: locations.scene_id
    expect(m.has('sc_03')).toBe(false) // wide_shot 없음
  })
})
