import { describe, expect, it } from 'vitest'
import { moveObjectsToProps } from '@/lib/writer/pipeline/stages/v4_shots'
import type { ShotStaticSpec } from '@/lib/writer/types/pipeline'

// #g4 (2026-08-27) — 사물이 character_blocking 에 섞이는 것을 코드가 바로잡는다.
//
// 배경: v4 프롬프트가 "blocking 은 사람만, 사물은 prop_placement 로"를 명시하는데도
//   모델이 지키지 않는 일이 반복됐다(실측: 화개장터 sh_04_20 엿판). 그 결과 그리드가
//   "figure 2 …, blank head" 로 직렬화했고 '안긴 아기'가 그려졌다(#object-not-figure).
//
// 지시는 확률이고 이 변환은 결정론이다.
//   2026-08-27: 이 강제가 자리잡아 하류 걸러내기(objectCharacterIds)를 실제로 지웠다 —
//   G4 완료 판정 기준을 통과했다. 이제 이 시험이 그 사고를 막는 유일한 방어선이다.

const spec = (over: Partial<ShotStaticSpec> = {}): ShotStaticSpec =>
  ({
    shot_id: 'sh_04_20',
    lens_mm: 35,
    shot_type: 'MFS',
    camera_angle: 'eye_level',
    depth_of_field: 'medium',
    framing: { focal_point: 'subject', rule: 'thirds', layers: {} },
    lighting: { key_fill_ratio: '4:1', color_temp_kelvin: 5000, quality: 'soft', key_direction: 'top_left' },
    character_blocking: [],
    prop_placement: [],
    palette_emphasis: [],
    texture_notes: '',
    color_grading_intent: '',
    first_frame_prompt: '',
    ...over,
  }) as ShotStaticSpec

const blocking = (id: string, pos = 'center') => ({
  character_id: id, position_in_frame: pos, pose: 'standing', gaze: 'ahead', asset_version: 'v1',
})

describe('사물은 인물 자리에 앉을 수 없다', () => {
  it('실사고 재현: 엿판이 blocking 에 있으면 prop_placement 로 옮긴다', () => {
    const out = moveObjectsToProps(
      spec({ character_blocking: [blocking('char_1'), blocking('obj_1', 'chest')] }),
      new Set(['obj_1']),
    )
    // 사람만 남는다
    expect(out.character_blocking.map((b) => b.character_id)).toEqual(['char_1'])
    // 사물은 소품으로 이동하고 위치를 보존한다
    expect(out.prop_placement).toEqual([
      { prop: 'obj_1', position_in_frame: 'chest', significance: 'carried' },
    ])
  })

  it('사물만 있는 인서트 컷도 처리한다 — blocking 이 비어도 소품은 남는다', () => {
    const out = moveObjectsToProps(
      spec({ character_blocking: [blocking('obj_1')] }),
      new Set(['obj_1']),
    )
    expect(out.character_blocking).toEqual([])
    expect(out.prop_placement).toHaveLength(1)
  })

  it('이미 prop_placement 에 있으면 중복해 넣지 않는다 (모델이 양쪽에 쓴 경우)', () => {
    const out = moveObjectsToProps(
      spec({
        character_blocking: [blocking('obj_1')],
        prop_placement: [{ prop: 'obj_1', position_in_frame: 'left', significance: 'hero' }],
      }),
      new Set(['obj_1']),
    )
    expect(out.prop_placement).toHaveLength(1)
    // 기존 항목이 이긴다 — 모델이 소품 칸에 쓴 것이 더 정확한 의도다
    expect(out.prop_placement[0].significance).toBe('hero')
  })

  it('사물이 없으면 원본을 그대로 돌려준다 (불필요한 객체 생성 없음)', () => {
    const input = spec({ character_blocking: [blocking('char_1')] })
    expect(moveObjectsToProps(input, new Set(['obj_1']))).toBe(input)
    expect(moveObjectsToProps(input, new Set())).toBe(input)
  })

  it('blocking 이 비어 있으면 손대지 않는다', () => {
    const input = spec()
    expect(moveObjectsToProps(input, new Set(['obj_1']))).toBe(input)
  })

  it('사람 여럿 + 사물 여럿을 한 번에 가른다', () => {
    const out = moveObjectsToProps(
      spec({
        character_blocking: [
          blocking('char_1'), blocking('obj_1'), blocking('char_2'), blocking('obj_2'),
        ],
      }),
      new Set(['obj_1', 'obj_2']),
    )
    expect(out.character_blocking.map((b) => b.character_id)).toEqual(['char_1', 'char_2'])
    expect(out.prop_placement.map((p) => p.prop)).toEqual(['obj_1', 'obj_2'])
  })

  it('결정론 — 같은 입력이면 같은 출력', () => {
    const input = spec({ character_blocking: [blocking('char_1'), blocking('obj_1')] })
    const ids = new Set(['obj_1'])
    expect(moveObjectsToProps(input, ids)).toEqual(moveObjectsToProps(input, ids))
  })
})
