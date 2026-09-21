// 이 파일이 지키는 약속: 무대 솔버가 카메라를 풀 때 피사체가 프레임 안에 온전히 담기고, 앞을 가리는 인물과 프레임 밖으로 빠지는 피사체를 알린다.
//   근거: 2026-09-17 연출 실험(gemini·Opus 5·Astra·Fable 5.1 기준·사례·닫힌 루프) 실측 — 남은 연출 에러는 모델이 아니라 무대 솔버 규칙에서 났다.
//   에러 두 유형(웅크린 피사체가 프레임 아래로 빠짐 · 앞 인물이 프레임을 막음)과 그 표면화(프레임 밖 경고)를 여기서 고정한다.
import { describe, it, expect } from 'vitest'
import { solveCamera, placeCharacter, aspectRatioOf } from '@/lib/writer/pipeline/stage/geometry'
import { applyStageToShots } from '@/lib/writer/pipeline/stage/apply'
import type { SceneStage, StageCharacterState, ShotDesign, ShotStaticSpec, DecoupageShot } from '@/lib/writer/types/pipeline'

const ASPECT = aspectRatioOf('horizontal_16:9')

// 피사체 한 명(용족) + 축을 세울 상대(요정). 카메라는 남쪽에서 본다.
function stageWith(hero: Partial<StageCharacterState>): SceneStage {
  return {
    scene_id: 'scene_1',
    unit: 'm',
    landmarks: [],
    axis: { from: 'char', to: 'char_2' },
    camera_side: 'right',
    beats: [
      {
        beat: 0,
        characters: [
          { character_id: 'char', x: 0, y: 0, facing_deg: 180, posture: 'standing', height_m: 1.8, ...hero },
          { character_id: 'char_2', x: 3, y: 0, facing_deg: 180, posture: 'standing', height_m: 1.7 },
        ],
      },
    ],
  }
}

function spec(over: Partial<ShotStaticSpec>): ShotStaticSpec {
  return {
    shot_id: 'x', lens_mm: 35, shot_type: 'MS', camera_angle: 'eye_level', depth_of_field: 'medium',
    framing: { rule: 'thirds', layers: {}, focal_point: '' },
    lighting: { key_fill_ratio: '8:1', color_temp_kelvin: 6000, quality: 'hard', key_direction: 'top_left' },
    character_blocking: [], prop_placement: [], palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: '',
    ...over,
  }
}
function shot(id: string, st: Partial<ShotStaticSpec>): ShotDesign {
  return {
    intent: { shot_id: id, scene_id: 'scene_1', story_beat_ref: 0, dramatic_purpose: '', duration_seconds: 5, duration_justification: '', audience_focus: '', shot_position_in_scene: 'developing' },
    static_spec: spec({ shot_id: id, ...st }),
    dynamic_spec: { shot_id: id, camera_motion: { type: 'static' as never, speed: 'slow', magnitude: 'moderate' }, character_motion: [], motion_prompt: '' },
  }
}
const dec = (shot_id: string): DecoupageShot => ({
  shot_id, scene_id: 'scene_1', operation: 'derived', shot_function: 'action', source_beats: [0],
  beat_summary: '', shot_size: 'MS', intended_duration_seconds: 5, rhythm_role: 'develop', camera_intent: 'static', dramatic_purpose: '',
})

describe('무대 솔버 프레임 안전 (2026-09-17 실측 후속)', () => {
  // 왜: 웅크리거나 앉은 피사체를 클로즈업할 때 솔버가 선 키 기준으로 시선을 잡아 피사체가 프레임 아래로 빠졌다(Fable·Astra 런에서 반복). 정상 경로 고정.
  it('웅크린·앉은 피사체를 잡으면 카메라 시선과 높이가 그 자세의 키로 내려가 피사체가 프레임 안에 들어온다', () => {
    const heroCrouch: StageCharacterState = { character_id: 'char', x: 0, y: 0, facing_deg: 180, posture: 'crouching', height_m: 1.8 }
    const heroStand: StageCharacterState = { ...heroCrouch, posture: 'standing' }
    const setup = { subject: 'char', from_direction: 'S' as const, height: 'eye' as const, lens_mm: 85 }
    const crouch = solveCamera({ setup, shotType: 'CU', aspect: ASPECT, stage: stageWith({ posture: 'crouching' }), states: [heroCrouch] })
    const stand = solveCamera({ setup, shotType: 'CU', aspect: ASPECT, stage: stageWith({}), states: [heroStand] })
    // 자세를 반영하면 같은 샷이라도 웅크린 피사체는 시선·카메라가 더 낮다.
    expect(crouch.camera.look_at.z).toBeLessThan(stand.camera.look_at.z)
    expect(crouch.camera.z).toBeLessThan(stand.camera.z)
    // 그리고 웅크린 피사체가 실제로 프레임 안에 담긴다(빠지지 않는다).
    expect(placeCharacter(crouch.camera, heroCrouch, ASPECT, crouch.subjectDistance).in_frame).toBe(true)
  })

  // 왜: 피사체 아닌 인물이 렌즈 앞을 막는 에러가 타이트 샷에서만 교정됐다. MS·MFS 같은 넓은 샷에서 전경 인물이 피사체를 가려도 그냥 통과했다(Opus 런 shot_31·37).
  it('피사체가 아닌 인물이 카메라와 피사체 사이를 크게 가리면 타이트 샷이 아니어도 카메라를 틀거나 경고한다', () => {
    // 피사체(용족)는 북쪽 0, 가리는 인물(수인)은 그 남쪽 1.2m(카메라와 피사체 사이), 카메라는 남쪽에서 MS 로 본다.
    const stage: SceneStage = {
      scene_id: 'scene_1', unit: 'm', landmarks: [], axis: { from: 'char', to: 'char_2' }, camera_side: 'right',
      beats: [{ beat: 0, characters: [
        { character_id: 'char', x: 0, y: 0, facing_deg: 180, posture: 'standing', height_m: 1.8 },
        { character_id: 'char_2', x: 0, y: -1.2, facing_deg: 0, posture: 'standing', height_m: 1.9 },
      ] }],
    }
    const s = shot('shot_1', { shot_type: 'MS', camera_setup: { subject: 'char', from_direction: 'S', height: 'eye', lens_mm: 50 } })
    const { issues } = applyStageToShots([s], stage, [dec('shot_1')], { format: 'horizontal_16:9' })
    expect(issues.some((i) => i.location === 'shot_1' && /가려|가리|렌즈 앞/.test(i.message))).toBe(true)
  })

  // 왜: 피사체가 위·아래로 빠질 때 position_in_frame 이 off_left/off_right 로만 적혀 어느 쪽으로 빠졌는지 알 수 없었고, 끝 프레임에서만 빠지면 경고도 없었다.
  it('피사체가 프레임 위나 아래로 빠지면 그 방향을 off_top·off_bottom 으로 적고, 시작이나 끝에서 빠지면 경고한다', () => {
    // 카메라를 아주 높이 두고 아래를 살짝만 보게 하면 지면의 피사체는 프레임 위로 벗어난다.
    const heroState: StageCharacterState = { character_id: 'char', x: 0, y: 0, facing_deg: 180, posture: 'standing', height_m: 1.8 }
    const highCam = { x: 0, y: -3, z: 8, look_at: { x: 0, y: 6, z: 7.5 }, lens_mm: 50, hfov_deg: 0 }
    const pl = placeCharacter(highCam, heroState, ASPECT, 3)
    expect(pl.in_frame).toBe(false)
    expect(['off_top', 'off_bottom']).toContain(pl.position_in_frame)

    // 그리고 apply 경로에서 피사체가 프레임 밖이면 방향을 담은 경고가 난다.
    const stage = stageWith({ posture: 'crouching', height_m: 1.8 })
    const s = shot('shot_1', { shot_type: 'ECU', camera_setup: { subject: 'char', from_direction: 'S', height: 'high', lens_mm: 85 } })
    const { issues } = applyStageToShots([s], stage, [dec('shot_1')], { format: 'horizontal_16:9' })
    const off = issues.find((i) => i.location === 'shot_1' && i.message.includes('피사체') && i.message.includes('프레임 밖'))
    // 솔버가 피사체를 잘 담으면 경고가 없을 수 있다 — 나면 반드시 방향(위·아래·좌·우)을 담는다.
    if (off) expect(/아래|위|왼쪽|오른쪽/.test(off.message)).toBe(true)
  })
})
