import { describe, it, expect } from 'vitest'
import { resolveEntityNames, manifestEntities } from '@/lib/writer/resolve-entity-names'

// #id-leak 2026-08-11 — 파이프라인이 산문 안에 char_3 / location_2 를 그대로 쓴다(프로덕션 실측).
// 표시 계층에서만 이름으로 바꾼다. 계약의 핵심은 "모르는 건 지어내지 않는다".

const entities = [
  { id: 'char_3', name: '카이' },
  { id: 'char_30', name: '미라' },
  { id: 'location_2', name: '항구 도시' },
]

describe('resolveEntityNames', () => {
  it('문장 안의 id 를 이름으로 바꾼다', () => {
    expect(resolveEntityNames('char_3 steps into the station.', entities)).toBe(
      '카이 steps into the station.',
    )
    expect(
      resolveEntityNames('the silhouette of location_2 appears', entities),
    ).toBe('the silhouette of 항구 도시 appears')
  })

  it('접두 일치로 오인하지 않는다 — char_30 을 char_3 으로 읽으면 다른 인물이 된다', () => {
    expect(resolveEntityNames('char_30 waits.', entities)).toBe('미라 waits.')
  })

  it('이름을 모르는 id 는 그대로 둔다 (지어내지 않는다)', () => {
    expect(resolveEntityNames('char_9 arrives.', entities)).toBe('char_9 arrives.')
  })

  it('맨몸 "Char" 는 건드리지 않는다 — 어느 인물인지 알 수 없다', () => {
    expect(resolveEntityNames('Char briefly glares.', entities)).toBe('Char briefly glares.')
  })

  it('치환 후 남는 동격 괄호는 벗긴다', () => {
    expect(
      resolveEntityNames('The father (char_3) waves his arms.', entities),
    ).toBe('The father waves his arms.')
  })

  it('이름이 아닌 괄호는 유지한다', () => {
    expect(resolveEntityNames('char_3 (30s) waits.', entities)).toBe('카이 (30s) waits.')
  })

  it('char_ ↔ character_ 표기 차이를 흡수한다', () => {
    expect(resolveEntityNames('character_3 nods.', entities)).toBe('카이 nods.')
    expect(
      resolveEntityNames('loc_2 at dusk.', [{ id: 'location_2', name: '항구 도시' }]),
    ).toBe('항구 도시 at dusk.')
  })

  it('빈 입력·빈 목록에 안전하다', () => {
    expect(resolveEntityNames(null, entities)).toBe('')
    expect(resolveEntityNames('char_3 walks.', [])).toBe('char_3 walks.')
    expect(resolveEntityNames('char_3 walks.', [{ id: 'char_3', name: '  ' }])).toBe(
      'char_3 walks.',
    )
  })
})

describe('manifestEntities', () => {
  it('인물과 장소를 한 목록으로 — 한 문장에 섞여 나온다', () => {
    const list = manifestEntities({
      characters: [{ characterId: 'char_1', name: '카이' }],
      locations: [{ locationId: 'location_1', name: '옥상' }],
    })
    expect(list).toEqual([
      { id: 'char_1', name: '카이' },
      { id: 'location_1', name: '옥상' },
    ])
  })

  it('manifest 가 없으면 빈 목록', () => {
    expect(manifestEntities(null)).toEqual([])
    expect(manifestEntities({})).toEqual([])
  })
})
