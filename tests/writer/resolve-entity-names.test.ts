// 등록된 인물과 장소는 이름으로 보여주고, 모르는 표기는 함부로 바꾸지 않는다 (#id-leak 2026-08-11)
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
  it('등록된 인물과 장소 표기가 문장에 있으면 알아보기 쉬운 이름으로 보여준다', () => {
    expect(resolveEntityNames('char_3 steps into the station.', entities)).toBe(
      '카이 steps into the station.',
    )
    expect(
      resolveEntityNames('the silhouette of location_2 appears', entities),
    ).toBe('the silhouette of 항구 도시 appears')
  })

  it('이름 표기가 서로 비슷해도 정확히 맞는 대상만 바꾼다', () => {
    expect(resolveEntityNames('char_30 waits.', entities)).toBe('미라 waits.')
  })

  it('등록되지 않은 인물 표기는 모르는 채로 두고 이름을 지어내지 않는다', () => {
    expect(resolveEntityNames('char_9 arrives.', entities)).toBe('char_9 arrives.')
  })

  it('대상을 특정할 수 없는 인물 표기는 일반 문장으로 그대로 둔다', () => {
    expect(resolveEntityNames('Char briefly glares.', entities)).toBe('Char briefly glares.')
  })

  it('인물 이름을 덧붙인 괄호는 이름을 보여준 뒤 깔끔하게 지운다', () => {
    expect(
      resolveEntityNames('The father (char_3) waves his arms.', entities),
    ).toBe('The father waves his arms.')
  })

  it('시간처럼 이름이 아닌 괄호 정보는 그대로 남긴다', () => {
    expect(resolveEntityNames('char_3 (30s) waits.', entities)).toBe('카이 (30s) waits.')
  })

  it('같은 인물을 가리키는 표기가 달라도 이름을 알아본다', () => {
    expect(resolveEntityNames('character_3 nods.', entities)).toBe('카이 nods.')
    expect(
      resolveEntityNames('loc_2 at dusk.', [{ id: 'location_2', name: '항구 도시' }]),
    ).toBe('항구 도시 at dusk.')
  })

  it('문장이나 인물 목록이 비어 있어도 안전하게 처리한다', () => {
    expect(resolveEntityNames(null, entities)).toBe('')
    expect(resolveEntityNames('char_3 walks.', [])).toBe('char_3 walks.')
    expect(resolveEntityNames('char_3 walks.', [{ id: 'char_3', name: '  ' }])).toBe(
      'char_3 walks.',
    )
  })
})

describe('manifestEntities', () => {
  it('인물과 장소가 함께 있으면 한데 모아 보여준다', () => {
    const list = manifestEntities({
      characters: [{ characterId: 'char_1', name: '카이' }],
      locations: [{ locationId: 'location_1', name: '옥상' }],
    })
    expect(list).toEqual([
      { id: 'char_1', name: '카이' },
      { id: 'location_1', name: '옥상' },
    ])
  })

  it('인물과 장소 정보가 없으면 빈 결과를 보여준다', () => {
    expect(manifestEntities(null)).toEqual([])
    expect(manifestEntities({})).toEqual([])
  })
})
