// #v2-cell-dedup (2026-08-17) 회귀 가드.
//
// V2 샷은 rich spec 이 없어 db_fallback 셀로 가는데, 셀 입력이 유닛 공통값(action·인물·
// 장소)뿐이라 같은 유닛의 샷 셀 서술이 문자 그대로 동일했다 → 모델이 같은 그림을 그림
// (실측 090042eb: 시트 프롬프트 Column 1 == Column 2). previzDirection(구도·카메라·동선)이
// 셀을 샷별로 갈라놓는지, rich spec 이 있으면 무시되는지 확인한다.
import { describe, expect, it } from 'vitest'
import { buildRoughGridCell } from '@/lib/writer/rough-storyboard-grid'
import type { RoughStoryboardPromptInput } from '@/lib/writer/rough-storyboard'

const BASE: RoughStoryboardPromptInput = {
  shotType: 'MS',
  actionDescription: 'A girl crawls through a ruined window and the floor collapses.',
  characterNames: ['girl'],
  location: 'ruined high-rise',
  durationSeconds: 6,
}

describe('buildRoughGridCell previzDirection (#v2-cell-dedup)', () => {
  it('같은 유닛 공통값이라도 previzDirection 이 다르면 셀 서술이 갈라진다', () => {
    const a = buildRoughGridCell(
      {
        ...BASE,
        previzDirection: {
          composition: 'wide establishing from the doorway',
          camera: 'slow push in',
          blocking: 'girl crosses left to right',
        },
      },
      'sh_01_01',
    )
    const b = buildRoughGridCell(
      {
        ...BASE,
        previzDirection: {
          composition: 'close on hands digging through rubble',
          camera: 'static low angle',
          blocking: 'girl kneels center frame',
        },
      },
      'sh_01_02',
    )
    expect(a.start).not.toBe(b.start)
    expect(a.start).toContain('composition for THIS shot: wide establishing from the doorway')
    expect(a.start).toContain('staging: girl crosses left to right')
    expect(b.start).toContain('close on hands digging through rubble')
  })

  it('previz 카메라 무브가 MOTION 재료가 된다 — static hold 균질화 방지', () => {
    const cell = buildRoughGridCell(
      { ...BASE, previzDirection: { camera: 'slow push in' } },
      'sh_01_01',
    )
    expect(cell.motion).toContain('camera: slow push in')
    expect(cell.motion).not.toContain('static hold')
    // END 도 무브 완료형으로 갈라진다 (static 문구가 아니라 변화 지시).
    expect(cell.end).toContain('movement completes')
  })

  it('previzDirection 이 없으면 기존 서술 그대로다 (레거시 무변화)', () => {
    const cell = buildRoughGridCell(BASE, 'sh_01_01')
    expect(cell.start).not.toContain('composition for THIS shot')
    expect(cell.motion).toContain('static hold')
  })

  it('rich spec 이 있으면 previzDirection 은 무시된다', () => {
    const cell = buildRoughGridCell(
      {
        ...BASE,
        spec: {
          staticSpec: {
            shot_id: 'sh_01_01',
            lens_mm: 50,
            shot_type: 'CU',
            camera_angle: 'low',
            depth_of_field: 'shallow',
            framing: {
              rule: 'center',
              layers: { midground: 'girl at the window' },
              focal_point: 'her hands',
            },
            character_blocking: [
              { character_id: 'girl', position_in_frame: 'center', pose: 'crawling', gaze: 'down' },
            ],
          } as never,
        },
        previzDirection: { composition: 'SHOULD NOT APPEAR', camera: 'SHOULD NOT APPEAR' },
      },
      'sh_01_01',
    )
    expect(cell.start).not.toContain('SHOULD NOT APPEAR')
    expect(cell.motion).not.toContain('SHOULD NOT APPEAR')
  })
})
