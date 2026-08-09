// 오픈캐스트 슬러그 노출 방지(#opencast-name 2026-08-06) 회귀.
//   계약: slug("char_1"/"location_1")는 사람이 읽는 표기로, 실제 이름·한국어 지명은 무변형.
import { describe, it, expect } from 'vitest'
import { displayNameOf, humanizeSlug } from '@/lib/display-name'
import { mergeOpenCast, mergeOpenWorld } from '@/lib/writer/pipeline/stages/s3_scenes'
import type { Characters, Scenes } from '@/lib/writer/types/pipeline'

describe('humanizeSlug / displayNameOf', () => {
  it('번호식·서술적 slug 를 사람이 읽는 표기로 바꾼다', () => {
    expect(humanizeSlug('location_1')).toBe('Location 1')
    expect(humanizeSlug('abandoned_subway')).toBe('Abandoned Subway')
    expect(humanizeSlug('char-2')).toBe('Char 2')
  })

  it('한국어 등 비슬러그 문자열은 그대로 통과한다', () => {
    expect(humanizeSlug('버려진 지하철역')).toBe('버려진 지하철역')
  })

  it('실제 이름이 있으면 그대로, slug 반복·공백이면 humanize(id) 폴백', () => {
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

describe('오픈캐스트 머지의 표시 이름 가드', () => {
  it('mergeOpenCast: 모델이 name 에 slug 를 되풀이하면 humanize 로 대체한다', () => {
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

  it('mergeOpenWorld: 새 로케이션 name 은 humanize, id(조인 키)는 원본 유지', () => {
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
