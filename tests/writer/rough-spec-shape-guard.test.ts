// 필요한 화면 정보가 없으면 잘못된 설계를 사용하지 않아 오류 화면이 나타나지 않는다 (#v2-rough-500 2026-08-17 #split-inherit 090042eb)
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
  it('화면 구성과 등장인물 배치가 있으면 러프 제작에 사용한다', () => {
    expect(isRichStaticSpec(RICH_SPEC)).toBe(true)
  })

  it('필요한 화면 정보가 없는 설계는 러프 제작에 사용하지 않는다', () => {
    expect(isRichStaticSpec(V2_SPEC)).toBe(false)
  })

  it('화면 틀만 있고 앞·중간·뒤 구분이 없으면 사용하지 않는다', () => {
    expect(
      isRichStaticSpec({ ...RICH_SPEC, framing: { rule: 'center', focal_point: 'x' } }),
    ).toBe(false)
  })

  it('등장인물 배치 목록이 아니면 사용하지 않는다', () => {
    expect(isRichStaticSpec({ ...RICH_SPEC, character_blocking: undefined })).toBe(false)
  })

  it('값이 없거나 글자 하나뿐이면 사용하지 않는다', () => {
    expect(isRichStaticSpec(null)).toBe(false)
    expect(isRichStaticSpec('MS')).toBe(false)
  })
})
