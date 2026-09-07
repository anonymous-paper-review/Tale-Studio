// 화면에는 사람이 읽을 이름을 보여 주고, 없는 이름은 알아보기 쉽게 대신 표시한다 (#opencast-name 2026-08-06)
// 오픈캐스트 슬러그 노출 방지(#opencast-name 2026-08-06) 회귀.
//   계약: slug("char_1"/"location_1")는 사람이 읽는 표기로, 실제 이름·한국어 지명은 무변형.
import { describe, it, expect } from 'vitest'
import { displayNameOf, humanizeSlug } from '@/lib/display-name'
import { mergeOpenCast, mergeOpenWorld } from '@/lib/writer/pipeline/stages/s3_scenes'
import type { Characters, Scenes } from '@/lib/writer/types/pipeline'

describe('humanizeSlug / displayNameOf가 사람이 읽을 이름을 정한다', () => {
  it('번호나 단어를 이어 쓴 이름을 사람이 읽는 이름으로 바꾼다', () => {
    expect(humanizeSlug('location_1')).toBe('Location 1')
    expect(humanizeSlug('abandoned_subway')).toBe('Abandoned Subway')
    expect(humanizeSlug('char-2')).toBe('Char 2')
  })

  it('한국어처럼 이미 읽기 쉬운 이름은 그대로 둔다', () => {
    expect(humanizeSlug('버려진 지하철역')).toBe('버려진 지하철역')
  })

  it('사람이 정한 이름이 없거나 번호처럼 보이면 알아보기 쉬운 이름을 대신 쓴다', () => {
    expect(displayNameOf('복면의 추적자', 'masked_pursuer')).toBe('복면의 추적자')
    expect(displayNameOf('char_1', 'char_1')).toBe('Char 1')
    expect(displayNameOf('', 'location_2')).toBe('Location 2')
    expect(displayNameOf(undefined, 'oasis_trackers')).toBe('Oasis Trackers')
  })
})

const EMPTY_CAST: Characters = { characters: [], relationships: [], subtext_notes: [] }

function scenesWith(over: Partial<Scenes>): Scenes {
  return { scenes: [], total_estimated_seconds: 0, ...over }
}

describe('오픈캐스트 결과에 표시할 이름 규칙', () => {
  it('인공지능이 이름 대신 번호를 반복하면 사람이 읽을 이름으로 바꾼다', () => {
    const merged = mergeOpenCast(
      EMPTY_CAST,
      scenesWith({
        new_characters: [
          { id: 'char_3', name: 'char_3' },
          { id: 'masked_pursuer', name: '복면의 추적자' },
        ],
      }),
    )
    const byId = new Map(merged.characters.map((c) => [c.id, c.name]))
    expect(byId.get('char_3')).toBe('Char 3')
    expect(byId.get('masked_pursuer')).toBe('복면의 추적자')
  })

  it('새 장소는 읽기 쉬운 이름을 쓰고 연결 정보는 그대로 둔다', () => {
    const world = mergeOpenWorld(
      { locations: [] },
      scenesWith({
        scenes: [
          { scene_id: 'sc_01', location: 'location_1' },
          { scene_id: 'sc_02', location: '버려진 지하철역' },
        ] as Scenes['scenes'],
      }),
    )
    const byId = new Map(world.locations.map((l) => [l.id, l.name]))
    expect(byId.get('location_1')).toBe('Location 1')
    expect(byId.get('버려진 지하철역')).toBe('버려진 지하철역')
  })
})
