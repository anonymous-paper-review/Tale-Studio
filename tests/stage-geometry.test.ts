// 씬 무대 기하(#stage 2026-09-03) — 핀홀 투영·카메라 풀이·180° 축·화면 낱말.
import { describe, it, expect } from 'vitest'
import {
  aspectRatioOf,
  axisSide,
  cameraDistanceFor,
  compassVector,
  depthBandOf,
  distanceScaleForMotion,
  facingVector,
  facingWordOf,
  lineOfSightObstructions,
  mirrorAcrossAxis,
  placeCharacter,
  positionWord,
  project,
  solveCamera,
} from '@/lib/writer/pipeline/stage/geometry'
import type { SceneStage, StageCharacterState } from '@/lib/writer/types/pipeline'

// 겨울_4 씬 1(27번 이후): 요정 서쪽·용족 동쪽, 축 = 요정→용족, 카메라는 남쪽(축의 오른쪽).
const FAIRY: StageCharacterState = { character_id: 'char_2', x: -1.3, y: 0.6, facing_deg: 27, posture: 'standing', height_m: 1.7 }
const DRAGON: StageCharacterState = { character_id: 'char', x: 1.3, y: 0.6, facing_deg: 333, posture: 'standing', height_m: 1.9 }
const BEAST: StageCharacterState = { character_id: 'char_3', x: 0, y: 5, facing_deg: 180, posture: 'standing', height_m: 2.0 }
const STAGE: SceneStage = {
  scene_id: 'scene_1',
  unit: 'm',
  landmarks: [{ id: 'forest', label: 'inverted forest', x: 0, y: 38 }],
  axis: { from: 'char_2', to: 'char' },
  camera_side: 'right',
  beats: [{ beat: 3, characters: [FAIRY, DRAGON, BEAST] }],
}
const ASPECT = 16 / 9

describe('기본 벡터·화각', () => {
  it('나침반과 향 벡터', () => {
    expect(compassVector('S')).toEqual({ x: 0, y: -1 })
    expect(facingVector(90).x).toBeCloseTo(1)
    expect(facingVector(0).y).toBeCloseTo(1)
    expect(aspectRatioOf('vertical_9:16')).toBeCloseTo(9 / 16)
    expect(aspectRatioOf(null)).toBeCloseTo(16 / 9)
  })

  it('샷 사이즈·렌즈 → 거리: 35mm 미디엄 ≈ 2.2m, 85mm 미디엄 클로즈업 ≈ 3.6m, 35mm 와이드 ≈ 7.8m', () => {
    expect(cameraDistanceFor('MS', 35, ASPECT)).toBeCloseTo(2.16, 1)
    expect(cameraDistanceFor('MCU', 85, ASPECT)).toBeCloseTo(3.57, 1)
    expect(cameraDistanceFor('WS', 35, ASPECT)).toBeCloseTo(7.78, 1)
  })
})

describe('180° 축', () => {
  it('축의 왼쪽/오른쪽 판정과 거울 반사', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 1, y: 0 }
    expect(axisSide(from, to, { x: 0.5, y: 1 })).toBe('left')
    expect(axisSide(from, to, { x: 0.5, y: -1 })).toBe('right')
    expect(mirrorAcrossAxis(from, to, { x: 0.5, y: 2 })).toEqual({ x: 0.5, y: -2 })
  })

  it('반대편에 놓인 카메라는 축 안쪽으로 반사되고 이슈가 남는다', () => {
    // 수인(북쪽 5m)을 남쪽에서 MS 로 잡으면 카메라가 축(y=0.6) 북쪽에 놓인다 → 반사
    const r = solveCamera({ setup: { subject: 'char_3', from_direction: 'S', height: 'eye', lens_mm: 35 }, shotType: 'MS', aspect: ASPECT, stage: STAGE, states: STAGE.beats[0].characters })
    expect(r.axisCorrected).toBe(true)
    expect(r.camera.y).toBeLessThan(0.6)
    expect(r.issues.some((m) => m.includes('축'))).toBe(true)
  })

  it('동기 있는 축 넘기(axis_cross=motivated)는 그대로 둔다', () => {
    const r = solveCamera({ setup: { subject: 'char_3', from_direction: 'S', height: 'eye', lens_mm: 35, axis_cross: 'motivated' }, shotType: 'MS', aspect: ASPECT, stage: STAGE, states: STAGE.beats[0].characters })
    expect(r.axisCorrected).toBe(false)
    expect(r.camera.y).toBeGreaterThan(0.6)
  })
})

describe('카메라 풀이', () => {
  it('피사체·방향·샷 사이즈에서 위치가 나온다 — 남쪽에서 본 와이드 그룹', () => {
    const r = solveCamera({ setup: { subject: 'group', from_direction: 'S', height: 'eye', lens_mm: 35 }, shotType: 'WS', aspect: ASPECT, stage: STAGE, states: [FAIRY, DRAGON, { ...BEAST, y: 1.2 }] })
    expect(r.axisCorrected).toBe(false)
    expect(r.camera.x).toBeCloseTo(0, 1)
    expect(r.camera.y).toBeLessThan(-5)
    expect(r.camera.look_at.y).toBeCloseTo(0.8, 1)
  })

  it('어깨 너머(OTS)는 그 인물 뒤에 선다', () => {
    const r = solveCamera({ setup: { subject: 'char_2', from_direction: 'E', height: 'eye', lens_mm: 50, over_shoulder_of: 'char' }, shotType: 'OTS', aspect: ASPECT, stage: STAGE, states: [FAIRY, DRAGON] })
    expect(Math.hypot(r.camera.x - DRAGON.x, r.camera.y - DRAGON.y)).toBeLessThan(1.6)
    expect(r.camera.look_at.x).toBeCloseTo(FAIRY.x, 1)
  })

  it('없는 피사체는 그룹 중심으로 대체하고 이슈를 남긴다', () => {
    const r = solveCamera({ setup: { subject: 'nobody', from_direction: 'S', height: 'eye', lens_mm: 35 }, shotType: 'MS', aspect: ASPECT, stage: STAGE, states: [FAIRY, DRAGON] })
    expect(r.issues[0]).toContain('무대에 없어')
    expect(r.camera.look_at.x).toBeCloseTo(0, 1)
  })
})

describe('투영과 화면 낱말', () => {
  const cam = { x: 0, y: -3, z: 1.5, look_at: { x: 0, y: 5, z: 1.0 }, lens_mm: 35, hfov_deg: 54.4 }

  it('정면의 점은 화면 가운데, 왼쪽의 점은 u<0', () => {
    expect(project(cam, { x: 0, y: 5, z: 1.0 }, ASPECT)!.u).toBeCloseTo(0, 3)
    expect(project(cam, { x: -1.3, y: 0.6, z: 0 }, ASPECT)!.u).toBeLessThan(0)
    expect(project(cam, { x: 0, y: -4, z: 0 }, ASPECT)).toBeNull() // 카메라 뒤
  })

  it('낱말 경계', () => {
    expect(positionWord(-1.2)).toBe('off_left')
    expect(positionWord(-0.8)).toBe('frame_edge_left')
    expect(positionWord(-0.5)).toBe('left_third')
    expect(positionWord(0)).toBe('center_third')
    expect(positionWord(0.5)).toBe('right_third')
    expect(positionWord(0.9)).toBe('frame_edge_right')
    expect(positionWord(1.3)).toBe('off_right')
    expect(depthBandOf(1, 4)).toBe('foreground')
    expect(depthBandOf(4, 4)).toBe('midground')
    expect(depthBandOf(9, 4)).toBe('background')
  })

  it('겨울_4 28번 무대: 수인 가운데(멀리·작게), 요정 왼쪽·용족 오른쪽(가까이·등)', () => {
    const subjectDistance = 8
    const beast = placeCharacter(cam, BEAST, ASPECT, subjectDistance)
    const fairy = placeCharacter(cam, FAIRY, ASPECT, subjectDistance)
    const dragon = placeCharacter(cam, DRAGON, ASPECT, subjectDistance)
    expect(beast.position_in_frame).toBe('center_third')
    expect(beast.in_frame).toBe(true)
    expect(beast.apparent_height).toBeLessThan(0.6)
    expect(fairy.screen_x).toBeLessThan(0)
    expect(dragon.screen_x).toBeGreaterThan(0)
    expect(fairy.depth_band).toBe('foreground')
    expect(fairy.facing).toContain('back')
    expect(beast.facing).toBe('front')
    expect(facingWordOf({ ...DRAGON, facing_deg: 270 }, cam)).toBe('profile_left') // 서쪽을 보면 화면 왼쪽
  })

  it('누운 인물은 실효 높이가 낮다', () => {
    const lying = placeCharacter(cam, { ...BEAST, posture: 'lying' }, ASPECT, 8)
    const standing = placeCharacter(cam, BEAST, ASPECT, 8)
    expect(lying.apparent_height).toBeLessThan(standing.apparent_height)
  })

  it('카메라 무브 → END 거리 배율', () => {
    expect(distanceScaleForMotion({ type: 'dolly_in' })).toBeLessThan(1)
    expect(distanceScaleForMotion({ type: 'tracking', direction: 'forward' })).toBeLessThan(1)
    expect(distanceScaleForMotion({ type: 'dolly_out', magnitude: 'large' })).toBeGreaterThan(1.5)
    expect(distanceScaleForMotion({ type: 'pan', direction: 'left' })).toBe(1)
    expect(distanceScaleForMotion(null)).toBe(1)
  })
})

describe('어깨 너머(OTS)와 시야 가림 (#stage 실측 수리)', () => {
  it('OTS 는 씬 축 보정을 받지 않고 어깨 인물 뒤에 머문다 — 어깨 인물이 축 반대편에 있어도', () => {
    // 용족(축 from)의 어깨 너머로 남쪽 5m 의 수인을 본다: 카메라는 용족 뒤(북쪽) = 씬 축 반대편
    const beastSouth: StageCharacterState = { ...BEAST, y: -4, facing_deg: 0 }
    const r = solveCamera({ setup: { subject: 'char_3', from_direction: 'N', height: 'eye', lens_mm: 35, over_shoulder_of: 'char' }, shotType: 'OTS', aspect: ASPECT, stage: STAGE, states: [FAIRY, DRAGON, beastSouth] })
    expect(r.axisCorrected).toBe(false)
    expect(Math.hypot(r.camera.x - DRAGON.x, r.camera.y - DRAGON.y)).toBeLessThan(1.6)
    expect(r.camera.look_at.y).toBeCloseTo(-4, 1)
  })

  it('OTS 의 비키는 쪽은 가능하면 camera_side 쪽', () => {
    // 요정 어깨 너머로 용족을 본다(둘 다 축 위) — 남쪽(right) 후보를 고른다
    const r = solveCamera({ setup: { subject: 'char', from_direction: 'W', height: 'eye', lens_mm: 50, over_shoulder_of: 'char_2' }, shotType: 'OTS', aspect: ASPECT, stage: STAGE, states: [FAIRY, DRAGON] })
    expect(axisSide({ x: FAIRY.x, y: FAIRY.y }, { x: DRAGON.x, y: DRAGON.y }, { x: r.camera.x, y: r.camera.y })).toBe('right')
  })

  it('프레임 안 판정과 off 낱말의 경계가 같다(±1.05)', () => {
    const cam = { x: 0, y: -3, z: 1.5, look_at: { x: 0, y: 5, z: 1.0 }, lens_mm: 35, hfov_deg: 54.4 }
    const edge = placeCharacter(cam, { ...DRAGON, x: 4.4, y: 5 }, ASPECT, 8) // u ≈ 1.07
    expect(edge.in_frame).toBe(false)
    expect(edge.position_in_frame).toBe('off_right')
    const inside = placeCharacter(cam, { ...DRAGON, x: 3.9, y: 5 }, ASPECT, 8) // u ≈ 0.95
    expect(inside.in_frame).toBe(true)
    expect(inside.position_in_frame).toBe('frame_edge_right')
  })

  it('시야 가림: 피사체 앞을 막는 비피사체를 찾는다', () => {
    const cam = { x: 0.52, y: -2.52, z: 1.54, look_at: { x: -2, y: 0, z: 1.7 }, lens_mm: 85, hfov_deg: 23.9 }
    const blocker: StageCharacterState = { ...BEAST, x: -0.5, y: -1 }
    const clear = lineOfSightObstructions(cam, [DRAGON, FAIRY], new Set(['char']), ASPECT, 3.57)
    expect(clear).toEqual([])
    const blocked = lineOfSightObstructions(cam, [{ ...DRAGON, x: -2, y: 0 }, blocker], new Set(['char']), ASPECT, 3.57)
    expect(blocked).toEqual(['char_3'])
  })
})
