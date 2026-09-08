// 샷 배치 문장이 말하는 자세가 무대 비트의 자세보다 우선한다 (#posture-authority 2026-09-08, 실측 겨울_8 sh_02_08)
//   왜: 같은 Writer 실행에서 무대 비트는 "부유", 샷 문장은 "crouched on ground" — 배치도는 비트를, 러프는 문장을 따라 어긋났다.
import { describe, it, expect } from 'vitest'
import { postureFromPoseText, postureFromMotionText, verticalFromMotionText } from '@/lib/writer/pipeline/stage/posture_text'
import { applyPostureAuthority, applyStageToShots } from '@/lib/writer/pipeline/stage/apply'
import { columnFromLayout } from '@/lib/writer/pipeline/stage/blockout'
import type { SceneStage, ShotDesign, ShotStaticSpec, StageCharacterState } from '@/lib/writer/types/pipeline'

const dragon = (over: Partial<StageCharacterState> = {}): StageCharacterState => ({
  character_id: 'char', x: 0, y: 0, facing_deg: 90, posture: 'floating', height_m: 2.0, note: '거대한 날개를 펼치며 수직 벽으로 날아오르는 상태', ...over,
})
const beast = (over: Partial<StageCharacterState> = {}): StageCharacterState => ({
  character_id: 'char_3', x: -1.5, y: 2, facing_deg: 180, posture: 'standing', height_m: 1.9, ...over,
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
function shot(id: string, pose: string, over: Partial<ShotStaticSpec> = {}): ShotDesign {
  return {
    intent: { shot_id: id, scene_id: 'sc_02', story_beat_ref: 0, dramatic_purpose: '', duration_seconds: 7, duration_justification: '', audience_focus: '', shot_position_in_scene: 'developing' },
    static_spec: spec({
      shot_id: id,
      camera_setup: { subject: 'char', from_direction: 'SW', height: 'low', lens_mm: 50 },
      character_blocking: [{ character_id: 'char', position_in_frame: 'center_third', pose, gaze: 'upward', asset_version: 'v1' }],
      ...over,
    }),
    dynamic_spec: { shot_id: id, camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' }, character_motion: [], motion_prompt: '' },
  }
}
const layoutOf = (r: ReturnType<typeof applyStageToShots>, id: string) => r.shots.find((s) => s.intent.shot_id === id)!.static_spec.screen_layout!
const charOf = (r: ReturnType<typeof applyStageToShots>, id: string) => layoutOf(r, id).characters.find((c) => c.character_id === 'char')!

describe('자세 낱말 읽기', () => {
  it('배치 문장의 자세는 첫 절에서 가장 앞의 낱말이고, 시선·타인 묘사("watching the fairy floating")는 읽지 않는다', () => {
    // 왜: 문장 뒤쪽은 시선·상대 묘사라 주어의 자세가 아니다 — 잘못 읽으면 서 있는 사람을 띄운다.
    expect(postureFromPoseText('crouched on ground with massive dragon wings unfurled wide')?.posture).toBe('crouching')
    expect(postureFromPoseText('standing near rock ledge watching the dragon leader fly')?.posture).toBe('standing')
    expect(postureFromPoseText('gazing up at the fairy floating above')).toBeNull()
    expect(postureFromPoseText('lying on his side on the inverted rock face with eyes closed')?.posture).toBe('lying')
    expect(postureFromPoseText('standing, 추락하는 용족 수장을 긴박하게 바라봄, in the midground')?.posture).toBe('standing')
    expect(postureFromPoseText('hovering silently in mid-air with faint ethereal wing silhouette')?.posture).toBe('floating')
    expect(postureFromPoseText('stepping onto rock footholds alongside them, keeping balance')?.posture).toBe('walking')
    expect(postureFromPoseText('falling past in background frame')?.posture).toBe('floating')
    expect(postureFromPoseText('바위 위에 웅크린 채 숨을 고른다')?.posture).toBe('crouching')
    expect(postureFromPoseText('hanging dangerously by fingertips on rock')).toBeNull()
    expect(postureFromPoseText('an outstanding view of the situation')).toBeNull()
  })

  it('"falling pressure"·"running water"·"standing stone"처럼 사물을 꾸미는 낱말은 자세로 읽지 않는다', () => {
    // 왜: 실측 겨울_8 sh_04_21 — "brace against falling pressure" 가 인물의 추락(누움)으로 읽혔다.
    expect(postureFromMotionText('steps forward and raises arms to brace against falling pressure')?.posture).toBe('walking')
    expect(verticalFromMotionText('steps forward and raises arms to brace against falling pressure')).toBeNull()
    expect(postureFromPoseText('wading through running water')).toBeNull()
    expect(postureFromPoseText('beside a standing stone')).toBeNull()
    expect(postureFromPoseText('standing elegantly in silver robe')?.posture).toBe('standing')
    expect(postureFromPoseText('falling past in background frame')?.posture).toBe('floating')
    expect(verticalFromMotionText('drops the sword and steps back')).toBeNull()
    expect(verticalFromMotionText('drops to one knee')).toBe('down')
    expect(postureFromMotionText('drops to one knee')?.posture).toBe('kneeling')
  })

  it('동작 문장의 끝 자세는 가장 뒤의 낱말이고("rises from lying to standing" → 섬), 수직 방향은 도약·비행이 위, 추락·착지가 아래다', () => {
    // 왜: 동작은 시작→끝 순서로 적히므로 끝 상태는 마지막 낱말이다. "stands up"·"climbs up"은 공중이 아니다.
    expect(postureFromMotionText('rises from lying on the ground to standing')?.posture).toBe('standing')
    expect(postureFromMotionText('pushes up from lying to a sitting position')?.posture).toBe('sitting')
    expect(verticalFromMotionText('leaps powerfully vertical into the air')).toBe('up')
    expect(verticalFromMotionText('lands heavily on the ledge')).toBe('down')
    expect(verticalFromMotionText('leaps up then falls back')).toBe('down')
    expect(verticalFromMotionText('stands up and looks around')).toBeNull()
    expect(verticalFromMotionText('climbs up the rock wall')).toBeNull()
    expect(verticalFromMotionText('날개를 펼쳐 수직 암벽으로 도약한다')).toBe('up')
  })
})

describe('자세 권위 — 무대 적용', () => {
  const ST = stage([{ beat: 0, characters: [dragon(), beast()] }])

  it('샷 배치 문장이 자세를 말하면(웅크림·누움·앉음·무릎·섬·걸음·달림·부유) 배치도 START 캡슐은 무대 비트의 자세가 아니라 그 자세로 그린다', () => {
    // 왜: 실측 겨울_8 sh_02_08 — 비트 '부유' 캡슐이 러프의 웅크린 인물과 어긋났다. 정상 경로 고정.
    const r = applyStageToShots([shot('sh_02_08', 'crouched on ground with massive dragon wings unfurled wide')], ST, null, { aspect: 16 / 9 })
    const c = charOf(r, 'sh_02_08')
    expect(c.start.posture).toBe('crouching')
    const col = columnFromLayout(layoutOf(r, 'sh_02_08'), ['char'])
    expect(col.start!.figures[0].placement.posture).toBe('crouching')
    // 웅크린 인물은 서 있는 인물(같은 거리)보다 낮게 잡힌다 — 캡슐 크기에 반영.
    const standing = applyStageToShots([shot('sh_02_08', 'standing tall with wings folded')], ST, null, { aspect: 16 / 9 })
    expect(c.start.apparent_height).toBeLessThan(charOf(standing, 'sh_02_08').start.apparent_height)
  })

  it('샷 배치 문장에 자세 낱말이 없으면 무대 비트의 자세를 그대로 쓴다', () => {
    // 왜: 손을 잡는 등 자세 없는 문장에서 비트의 진실을 버리면 안 된다. 정상 경로 고정.
    const r = applyStageToShots([shot('sh_02_12', "scaled fingers gripping Beast Leader's hand with fierce resolve")], ST, null, { aspect: 16 / 9 })
    expect(charOf(r, 'sh_02_12').start.posture).toBe('floating')
    expect(r.issues.some((i) => i.message.includes('자세 권위'))).toBe(false)
  })

  it('비트가 START와 END의 자세를 다르게 적었으면(부유→웅크림) 샷 문장은 그 인물을 건드리지 않는다 — 전이는 비트대로 보여준다', () => {
    // 왜: 추락 샷처럼 비트가 명시한 전이를 문장(한 상태만 적음)이 덮으면 변화가 사라진다(겨울_8 sh_02_09·sh_01_03).
    const withEnd = stage([{ beat: 0, characters: [dragon(), beast()], end_characters: [dragon({ posture: 'crouching', x: -0.8, y: 1.5 }), beast()] }])
    const states = applyPostureAuthority({ start: withEnd.beats[0].characters, end: withEnd.beats[0].end_characters!, beatUsed: 0 }, [
      { character_id: 'char', position_in_frame: 'center_third', pose: 'standing on the ledge, wings tense', gaze: 'down', asset_version: 'v1' },
    ])
    expect(states.start.find((c) => c.character_id === 'char')!.posture).toBe('floating')
    expect(states.end.find((c) => c.character_id === 'char')!.posture).toBe('crouching')
    // 전이가 없는 비트(END 자세 = START 자세)면 END 도 함께 바뀐다.
    const sameEnd = applyPostureAuthority({ start: withEnd.beats[0].characters, end: [dragon({ x: 3 }), beast()], beatUsed: 0 }, [
      { character_id: 'char', position_in_frame: 'center_third', pose: 'standing on the ledge', gaze: 'down', asset_version: 'v1' },
    ])
    expect(sameEnd.end.find((c) => c.character_id === 'char')!.posture).toBe('standing')
  })

  it('비트가 이 샷 안에서 자세 전이를 적었으면(누움→섬) 샷 문장은 START를 바꾸지 않는다 — 전이는 이 샷이 보여준다', () => {
    // 왜: 실측 겨울_8 sh_01_03 — 전이 샷의 문장 "standing up …" 이 START 를 섬으로 바꿔 배치도에서 일어나는 변화가 사라졌다.
    const rising = stage([{ beat: 0, characters: [dragon({ posture: 'lying' }), beast()], end_characters: [dragon({ posture: 'standing' }), beast()] }])
    const r = applyStageToShots([shot('sh_01_03', 'standing up on the rock platform while looking high above')], rising, null, { aspect: 16 / 9 })
    const c = charOf(r, 'sh_01_03')
    expect(c.start.posture).toBe('lying')
    expect(c.end?.posture).toBe('standing')
    expect(r.issues.some((i) => i.message.includes('자세 권위'))).toBe(false)
  })

  it('자세를 바꿔 그렸으면 검사 목록에 "자세 권위: 인물 — 샷 문장 → 자세 (무대 비트: 자세)" 한 줄이 남는다', () => {
    // 왜: 오너가 비트와 문장의 모순을 보고 어느 쪽을 고칠지 정할 수 있어야 한다.
    const r = applyStageToShots([shot('sh_02_08', 'crouched on ground with massive dragon wings unfurled wide')], ST, null, { aspect: 16 / 9, names: new Map([['char', '용족 수장']]) })
    const msg = r.issues.find((i) => i.location === 'sh_02_08' && i.message.includes('자세 권위'))
    expect(msg?.message).toBe('자세 권위: 용족 수장 — 샷 문장 "crouched" → 웅크림 (무대 비트: 부유)')
    expect(layoutOf(r, 'sh_02_08').issues).toContain(msg!.message)
  })

  it('무대 비트 배열은 바뀌지 않는다(자세 권위는 샷 계산에만 쓴다)', () => {
    // 왜: 비트를 고치면 상태 장부·다음 샷이 오염된다 — 샷 계산용 복사본만 바꾼다.
    const before = JSON.stringify(ST)
    applyStageToShots([shot('sh_02_08', 'crouched on ground with massive dragon wings unfurled wide')], ST, null, { aspect: 16 / 9 })
    expect(JSON.stringify(ST)).toBe(before)
  })
})
