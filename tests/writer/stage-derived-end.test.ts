// 무대 비트에 END가 없어도 러프 배치도의 END는 동작·카메라 문장에서 추정해 그린다 — 추정은 러프 전용이고 무대·실사는 읽지 않는다 (#derived-end 2026-09-08)
//   왜(오너 결정): "B안에서 END는 필요해. previz 생성 시 END까지 생성하되 real에서 이를 참조하지 않고 생성하게 하자."
//   실측 겨울_8 sh_02_08: 도약 샷의 배치도 END 가 START 의 복사본이라 모델에 틀린 계약을 줬다.
import { describe, it, expect } from 'vitest'
import { applyStageToShots } from '@/lib/writer/pipeline/stage/apply'
import { deriveShotEnd, LIFT_M, FOLLOW_RISE_V } from '@/lib/writer/pipeline/stage/derive_end'
import { buildBlockoutSheetSvg, columnFromLayout } from '@/lib/writer/pipeline/stage/blockout'
import { buildBlockoutClause } from '@/lib/writer/rough-storyboard-grid'
import type { SceneStage, ShotDesign, ShotStaticSpec, StageCamera, StageCharacterState } from '@/lib/writer/types/pipeline'

const dragon = (over: Partial<StageCharacterState> = {}): StageCharacterState => ({
  character_id: 'char', x: 0, y: 0, facing_deg: 90, posture: 'floating', height_m: 2.0, ...over,
})
function stage(beats: SceneStage['beats']): SceneStage {
  return { scene_id: 'sc_02', unit: 'm', landmarks: [], axis: null, camera_side: 'right', version: 2, beats }
}
function spec(over: Partial<ShotStaticSpec>): ShotStaticSpec {
  return {
    shot_id: 'x', lens_mm: 50, shot_type: 'FS', camera_angle: 'low_angle', depth_of_field: 'medium',
    framing: { rule: 'center', layers: {}, focal_point: '' },
    lighting: { key_fill_ratio: '8:1', color_temp_kelvin: 5000, quality: 'hard', key_direction: 'bottom_left' },
    character_blocking: [], prop_placement: [], palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: '',
    ...over,
  }
}
type Cam = ShotDesign['dynamic_spec']['camera_motion']
type Motion = ShotDesign['dynamic_spec']['character_motion'][number]
function shot(id: string, pose: string, cam: Cam, motions: Motion[]): ShotDesign {
  return {
    intent: { shot_id: id, scene_id: 'sc_02', story_beat_ref: 0, dramatic_purpose: '', duration_seconds: 7, duration_justification: '', audience_focus: '', shot_position_in_scene: 'developing' },
    static_spec: spec({
      shot_id: id,
      camera_setup: { subject: 'char', from_direction: 'SW', height: 'low', lens_mm: 50 },
      character_blocking: [{ character_id: 'char', position_in_frame: 'center_third', pose, gaze: 'upward', asset_version: 'v1' }],
    }),
    dynamic_spec: { shot_id: id, camera_motion: cam, character_motion: motions, motion_prompt: '' },
  }
}
const STATIC: Cam = { type: 'static', speed: 'slow', magnitude: 'minimal' }
const TRACK_UP: Cam = { type: 'tracking', direction: 'up', speed: 'medium', magnitude: 'moderate', motivation: 'energy', target: 'char' }
const LEAP: Motion[] = [
  { character_id: 'char', verb: 'flaps massive wings', magnitude: 'medium' },
  { character_id: 'char', verb: 'leaps powerfully vertical into the air', magnitude: 'large' },
]
const POSE = 'crouched on ground with massive dragon wings unfurled wide'
const ST = stage([{ beat: 0, characters: [dragon()] }])
const layoutOf = (r: ReturnType<typeof applyStageToShots>, id: string) => r.shots.find((s) => s.intent.shot_id === id)!.static_spec.screen_layout!
const charOf = (r: ReturnType<typeof applyStageToShots>, id: string) => layoutOf(r, id).characters.find((c) => c.character_id === 'char')!

describe('END 추정 — 배치도', () => {
  it('무대 비트에 END가 없고 동작 문장이 공중으로 뛰어오른다고 하면 배치도 END 캡슐은 부유 자세로 START보다 위에, 지면에서 떠서 점선으로 그려진다', () => {
    // 왜: 실측 sh_02_08 — END 가 START 복사본이면 모델에 "안 움직였다"는 틀린 계약을 준다. 점선 = 추정 표시.
    const r = applyStageToShots([shot('sh_02_08', POSE, TRACK_UP, LEAP)], ST, null, { aspect: 16 / 9 })
    const c = charOf(r, 'sh_02_08')
    expect(c.start.posture).toBe('crouching')
    expect(c.end?.posture).toBe('floating')
    expect(c.end?.elevation_m).toBe(LIFT_M.large)
    expect(c.end!.screen_y).toBeGreaterThan(c.start.screen_y)
    const lay = layoutOf(r, 'sh_02_08')
    expect(lay.end_derived).toEqual({ characters: ['char'], camera: true })
    const col = columnFromLayout(lay, ['char'])
    expect(col.end!.figures[0].estimated).toBe(true)
    expect(col.start!.figures[0].estimated).toBeUndefined()
    const { svg } = buildBlockoutSheetSvg([col], { aspect: 16 / 9 })
    expect(svg).toContain('stroke-dasharray="7 5"') // 추정 캡슐
    expect(svg).toContain('stroke-dasharray="3 3"') // 공중 — 발밑 점선
    expect(r.issues.some((i) => i.location === 'sh_02_08' && i.message.startsWith('END 추정(러프 전용'))).toBe(true)
  })

  it('카메라가 그 인물을 따라 위로 트래킹하면 END 카메라는 인물의 꼭대기가 프레임에 남을 만큼만 남기고 같이 오른다', () => {
    // 왜: 절반만 따라가면 풀샷 인물이 프레임 위로 나갔다(실측 sh_02_08) — 인물은 프레임의 1/4 까지만 오르고 나머지는 카메라가 따라간다.
    const r = applyStageToShots([shot('sh_02_08', POSE, TRACK_UP, LEAP)], ST, null, { aspect: 16 / 9 })
    const lay = layoutOf(r, 'sh_02_08')
    const c = charOf(r, 'sh_02_08')
    expect(lay.end_camera).toBeDefined()
    const dzCam = lay.end_camera!.z - lay.camera.z
    expect(dzCam).toBeGreaterThan(0)
    expect(dzCam).toBeLessThanOrEqual(LIFT_M.large)
    expect(lay.end_camera!.look_at.z - lay.camera.look_at.z).toBeCloseTo(dzCam, 1)
    expect(c.end!.in_frame).toBe(true)
    expect(c.end!.screen_y + 2 * c.end!.apparent_height).toBeLessThanOrEqual(0.95) // 꼭대기가 프레임 안
    expect(c.end!.screen_y - c.start.screen_y).toBeLessThanOrEqual(FOLLOW_RISE_V + 0.05)
  })

  it('서기↔걷기↔달리기 사이의 변화는 END 추정으로 치지 않는다', () => {
    // 왜: 캡슐 그림이 같아 END 를 만들 이유가 없다 — 러프 END 문장에 헛 자리가 붙지 않는다(실측 sh_04_25 "steps forward").
    const r = applyStageToShots([shot('sh_04_25', 'standing firm leaning toward companions', STATIC, [{ character_id: 'char', verb: 'takes first step forward into the light', magnitude: 'small' }])], ST, null, { aspect: 16 / 9 })
    expect(charOf(r, 'sh_04_25').end).toBeUndefined()
    expect(layoutOf(r, 'sh_04_25').end_derived).toBeUndefined()
  })

  it('따라가는 무브(트래킹)에서 비트가 인물을 옮겼으면 END 카메라는 END 상태로 다시 풀어 인물을 프레임에 담는다', () => {
    // 왜: 종전엔 앞뒤 무브만 END 카메라를 풀어, 상하좌우 트래킹은 START 카메라로 END 를 계산해 인물이 프레임 밖으로 나갔다(실측 sh_02_09).
    const moved = stage([{ beat: 0, characters: [dragon({ posture: 'standing' })], end_characters: [dragon({ posture: 'crouching', x: -6, y: 4 })] }])
    const track: Cam = { type: 'tracking', direction: 'down', speed: 'fast', magnitude: 'moderate', motivation: 'energy', target: 'char' }
    const r = applyStageToShots([shot('sh_02_09', 'standing on the ledge', track, [])], moved, null, { aspect: 16 / 9 })
    const lay = layoutOf(r, 'sh_02_09')
    expect(lay.end_camera).toBeDefined()
    expect(charOf(r, 'sh_02_09').end?.in_frame).toBe(true)
    expect(lay.end_derived).toBeUndefined()
    expect(r.issues.some((i) => i.message.startsWith('따라가는 카메라'))).toBe(true)
  })

  it('동작 문장이 앉는다·눕는다·일어선다고 하면 END 자세가 그 자세가 되고, 떨어진다고 하면 지면으로 내려온다', () => {
    // 왜: 자세 변화도 END 그림이다 — 비트가 안 적어도 동작 문장이 말하면 배치도가 보여준다.
    const sit = applyStageToShots([shot('a', 'standing on the ledge', STATIC, [{ character_id: 'char', verb: 'sits down heavily on the rock', magnitude: 'medium' }])], ST, null, { aspect: 16 / 9 })
    expect(charOf(sit, 'a').end?.posture).toBe('sitting')
    expect(charOf(sit, 'a').end?.elevation_m).toBeUndefined()
    const fall = applyStageToShots([shot('b', 'hovering mid-air with wings spread', STATIC, [{ character_id: 'char', verb: 'plummets and lands hard on the ledge', magnitude: 'large' }])], ST, null, { aspect: 16 / 9 })
    expect(charOf(fall, 'b').start.posture).toBe('floating')
    expect(charOf(fall, 'b').end?.posture).toBe('standing')
    expect(charOf(fall, 'b').end?.elevation_m).toBeUndefined()
    const none = applyStageToShots([shot('c', POSE, STATIC, [{ character_id: 'char', verb: 'turns head warily and vibrates wings', magnitude: 'small' }])], ST, null, { aspect: 16 / 9 })
    expect(charOf(none, 'c').end).toBeUndefined()
    expect(layoutOf(none, 'c').end_derived).toBeUndefined()
  })

  it('비트가 END를 적은 인물과 전이 소유권이 핀으로 걸린 인물은 추정하지 않는다', () => {
    // 왜: 비트의 END 는 진실이고, 핀 걸린 샷은 그 변화를 보여주면 안 된다 — 추정이 진실을 덮으면 안 된다.
    const withEnd = stage([{ beat: 0, characters: [dragon()], end_characters: [dragon({ x: 3, y: 1 })] }])
    const r = applyStageToShots([shot('sh_02_08', POSE, STATIC, LEAP)], withEnd, null, { aspect: 16 / 9 })
    expect(charOf(r, 'sh_02_08').end?.elevation_m).toBeUndefined()
    expect(layoutOf(r, 'sh_02_08').end_derived).toBeUndefined()
    const pinned = applyStageToShots([shot('sh_02_08', POSE, STATIC, LEAP)], ST, null, { aspect: 16 / 9, pins: new Map([['sh_02_08', new Map([['char', 'start' as const]])]]) })
    expect(layoutOf(pinned, 'sh_02_08').end_derived).toBeUndefined()
  })

  it('추정한 END는 무대 비트와 다음 샷의 시작 상태를 바꾸지 않는다', () => {
    // 왜: 오너 결정 — 추정은 previz 보조일 뿐, 무대 원장·연속성 검사·실사의 진실이 되면 안 된다.
    const before = JSON.stringify(ST)
    const r = applyStageToShots([shot('sh_02_08', POSE, TRACK_UP, LEAP), shot('sh_02_08b', POSE, STATIC, [])], ST, null, { aspect: 16 / 9 })
    expect(JSON.stringify(ST)).toBe(before)
    const next = charOf(r, 'sh_02_08b')
    expect(next.start.posture).toBe('crouching')
    expect(next.start.elevation_m).toBeUndefined()
    expect(next.end).toBeUndefined()
  })

  it('러프 프롬프트는 추정한 END 열을 "추정"이라고 밝히고 움직임 문장이 우선한다고 적는다', () => {
    // 왜: 추정 캡슐을 "강한 계약"으로 주면 모델이 문장보다 그림을 따른다 — 추정 열만 계약을 풀어 준다.
    const plain = buildBlockoutClause(4)
    expect(plain).not.toContain('ESTIMATE')
    const est = buildBlockoutClause(4, { estimatedColumns: [2, 4] })
    expect(est).toContain('In columns 2, 4 the END panel is an ESTIMATE derived from the written movement (dashed capsules)')
    expect(est).toContain('the written movement and END description come first')
    expect(buildBlockoutClause(1, { estimatedColumns: [1] })).toContain('In this column the END panel is an ESTIMATE')
  })

  it('틸트·팬·좌우 트래킹은 END 카메라를 그만큼 돌리거나 옮긴다', () => {
    // 왜: 카메라만 움직이는 샷도 END 배치도가 START 복사본이었다 — 방향·크기별 고정 추정으로 채운다.
    const cam: StageCamera = { x: 0, y: -5, z: 1.5, look_at: { x: 0, y: 0, z: 1 }, lens_mm: 35, hfov_deg: 54 }
    const base = { start: [dragon({ posture: 'standing' })], end: [dragon({ posture: 'standing' })], motions: [], camera: cam, cameraAlreadyMoves: false, candidateIds: new Set(['char']) }
    const tilt = deriveShotEnd({ ...base, cameraMotion: { type: 'tilt', direction: 'up', magnitude: 'moderate' } })!
    expect(tilt.camera!.look_at.z).toBeGreaterThan(cam.look_at.z)
    expect(tilt.camera!.z).toBe(cam.z)
    const pan = deriveShotEnd({ ...base, cameraMotion: { type: 'pan', direction: 'right', magnitude: 'large' } })!
    expect(pan.camera!.look_at.x).toBeGreaterThan(0) // 북쪽을 보던 카메라가 오른쪽(동쪽)으로 돈다
    const truck = deriveShotEnd({ ...base, cameraMotion: { type: 'tracking', direction: 'left', magnitude: 'minimal' } })!
    expect(truck.camera!.x).toBeLessThan(cam.x)
    expect(truck.characters).toEqual([])
    expect(deriveShotEnd({ ...base, cameraMotion: { type: 'dolly_in', direction: 'forward', magnitude: 'moderate' }, cameraAlreadyMoves: true })).toBeNull()
  })
})
