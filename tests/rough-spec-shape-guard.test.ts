// #v2-rough-500 (2026-08-17) 회귀 가드.
//
// shots.static_spec 컬럼 폴백(#split-inherit)이 writer-v2 previz 스펙(다른 계약 모양 —
// framing·character_blocking 없음)을 rich 스펙으로 오채택하면, EN 번역기가
// s.framing.layers 를 가드 없이 역참조하다 라우트가 500 으로 죽는다
// (실측: V2 프로젝트 090042eb 러프 제출 전량 "Cannot read properties of undefined").
// 채택 기준은 선언(engine 마커)이 아니라 rich 소비자가 실제 역참조하는 필드의 존재다.
import { describe, expect, it } from 'vitest'
import { isRichStaticSpec } from '@/lib/writer/rough-storyboard'

const RICH_SPEC = {
  shot_id: 'sh_01_01',
  lens_mm: 35,
  shot_type: 'MS',
  camera_angle: 'eye_level',
  depth_of_field: 'medium',
  framing: {
    rule: 'thirds',
    layers: { foreground: '빗줄기', midground: '하나', background: '편의점 불빛' },
    focal_point: '하나의 손',
  },
  character_blocking: [{ character_id: 'ch_hana', pose: '우산을 내민다' }],
}

const V2_SPEC = {
  engine: 'writer-v2',
  contract_version: 'semantic-unit-previz-0.1',
  revision_id: '601ef85d',
  unit_id: 'unit_01_ruins_scavenge',
  shot_id: 'shot_01_01',
  intent: '폐허를 뒤진다',
  emotion: '긴장',
  composition: 'wide establishing',
  camera: 'slow push in',
  blocking: 'center frame',
  transition: 'cut',
}

describe('isRichStaticSpec', () => {
  it('rich 스펙(framing.layers·character_blocking)은 통과한다', () => {
    expect(isRichStaticSpec(RICH_SPEC)).toBe(true)
  })

  it('writer-v2 previz 스펙은 rich 가 아니다 → db_fallback 경로', () => {
    expect(isRichStaticSpec(V2_SPEC)).toBe(false)
  })

  it('framing 은 있으나 layers 가 없으면 rich 가 아니다', () => {
    expect(
      isRichStaticSpec({ ...RICH_SPEC, framing: { rule: 'center', focal_point: 'x' } }),
    ).toBe(false)
  })

  it('character_blocking 이 배열이 아니면 rich 가 아니다', () => {
    expect(isRichStaticSpec({ ...RICH_SPEC, character_blocking: undefined })).toBe(false)
  })

  it('null·원시값은 rich 가 아니다', () => {
    expect(isRichStaticSpec(null)).toBe(false)
    expect(isRichStaticSpec('MS')).toBe(false)
  })
})
