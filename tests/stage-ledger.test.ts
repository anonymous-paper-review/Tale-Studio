// 인물 상태 장부(#ledger 2026-09-03): 변화 추출·비트 사이 변화 정규화·보여주는 샷 판정·배경 동작 보충·미덮임 경고.
import { describe, it, expect } from 'vitest'
import { postureVerb, normalizeStageTransitions, deriveTransitions, applyLedgerToShots } from '@/lib/writer/pipeline/stage/ledger'
import { applyStageToShots } from '@/lib/writer/pipeline/stage/apply'
import type { DecoupageShot, SceneStage, ShotDesign, ShotStaticSpec } from '@/lib/writer/types/pipeline'

// 겨울_4 씬 1 축약: 세 수장이 누워 있다가(beat 0) 수인이 일어나 앉고(beat 0 end), 요정·용족은 beat 1 시작에 서 있다(설명 없는 변화).
const STAGE: SceneStage = {
  scene_id: 'scene_1', unit: 'm', landmarks: [], axis: { from: 'char', to: 'char_2' }, camera_side: 'right',
  beats: [
    {
      beat: 0,
      characters: [
        { character_id: 'char', x: -2, y: 0, facing_deg: 90, posture: 'lying' },
        { character_id: 'char_2', x: 2, y: 1, facing_deg: 270, posture: 'lying' },
        { character_id: 'char_3', x: -2, y: -3, facing_deg: 0, posture: 'lying' },
      ],
      end_characters: [
        { character_id: 'char', x: -2, y: 0, facing_deg: 90, posture: 'lying' },
        { character_id: 'char_2', x: 2, y: 1, facing_deg: 270, posture: 'lying' },
        { character_id: 'char_3', x: -2, y: -3, facing_deg: 0, posture: 'sitting' },
      ],
    },
    {
      beat: 1,
      characters: [
        { character_id: 'char', x: -2, y: 0, facing_deg: 135, posture: 'standing' },
        { character_id: 'char_2', x: 2, y: 1, facing_deg: 30, posture: 'standing' },
        { character_id: 'char_3', x: -2, y: -3, facing_deg: 0, posture: 'sitting' },
      ],
    },
    {
      beat: 3,
      characters: [
        { character_id: 'char', x: -2, y: 0, facing_deg: 150, posture: 'standing' },
        { character_id: 'char_2', x: 2, y: 1, facing_deg: 210, posture: 'standing' },
        { character_id: 'char_3', x: -2, y: -3, facing_deg: 30, posture: 'walking' },
      ],
      end_characters: [
        { character_id: 'char', x: -2, y: 0, facing_deg: 150, posture: 'standing' },
        { character_id: 'char_2', x: 2, y: 1, facing_deg: 210, posture: 'standing' },
        { character_id: 'char_3', x: -0.5, y: -1, facing_deg: 30, posture: 'standing' },
      ],
    },
  ],
}
const NAMES = new Map([['char', '용족 수장'], ['char_2', '요정 수장'], ['char_3', '수인 수장']])

describe('postureVerb', () => {
  it('큰 변화만 동작이 된다 — 서다↔걷다는 사소', () => {
    expect(postureVerb('lying', 'sitting')).toContain('sitting')
    expect(postureVerb('sitting', 'standing')).toBe('stands up')
    expect(postureVerb('lying', 'standing')).toContain('rises')
    expect(postureVerb('standing', 'walking')).toBeNull()
    expect(postureVerb('walking', 'standing')).toBeNull()
    expect(postureVerb('standing', 'standing')).toBeNull()
    expect(postureVerb('other', 'standing')).toBeNull()
  })
})

describe('normalizeStageTransitions', () => {
  it('비트 사이의 설명 없는 변화(누움→섬)를 직전 비트의 end_characters 로 옮긴다', () => {
    const n = normalizeStageTransitions(STAGE)
    const b0end = n.beats[0].end_characters!
    expect(b0end.find((c) => c.character_id === 'char')!.posture).toBe('standing')
    expect(b0end.find((c) => c.character_id === 'char_2')!.posture).toBe('standing')
    expect(b0end.find((c) => c.character_id === 'char_3')!.posture).toBe('sitting') // 원래 end 유지
    expect(STAGE.beats[0].end_characters!.find((c) => c.character_id === 'char')!.posture).toBe('lying') // 원본 불변
  })

  it('정규화 뒤 변화 목록: 용족·요정 누움→섬, 수인 누움→앉음(비트 0)·앉음→걸음(비트 1)·이동(비트 3)', () => {
    const ts = deriveTransitions(normalizeStageTransitions(STAGE))
    const key = (t: { character_id: string; beat: number; kind: string }) => `${t.character_id}@${t.beat}:${t.kind}`
    // 수인은 비트 1(앉음)→비트 3(걸음) 사이에 일어선다 — 설명 없는 변화라 비트 1 끝으로 옮겨져 목록에 든다.
    expect(ts.map(key).sort()).toEqual(['char@0:posture', 'char_2@0:posture', 'char_3@0:posture', 'char_3@1:posture', 'char_3@3:move'].sort())
    expect(ts.find((t) => t.character_id === 'char_3' && t.kind === 'move')!.distance_m).toBeCloseTo(2.5, 1)
  })
})

function spec(over: Partial<ShotStaticSpec>): ShotStaticSpec {
  return {
    shot_id: 'x', lens_mm: 35, shot_type: 'MS', camera_angle: 'eye_level', depth_of_field: 'medium',
    framing: { rule: 'thirds', layers: {}, focal_point: '' }, lighting: { key_fill_ratio: '8:1', color_temp_kelvin: 6000, quality: 'hard', key_direction: 'top_left' },
    character_blocking: [], prop_placement: [], palette_emphasis: [], texture_notes: '', color_grading_intent: '', first_frame_prompt: '', ...over,
  }
}
function shot(id: string, st: Partial<ShotStaticSpec>, motions: Array<{ character_id: string; verb: string }> = []): ShotDesign {
  return {
    intent: { shot_id: id, scene_id: 'scene_1', story_beat_ref: 0, dramatic_purpose: '', duration_seconds: 5, duration_justification: '', audience_focus: '', shot_position_in_scene: 'developing' },
    static_spec: spec({ shot_id: id, ...st }),
    dynamic_spec: { shot_id: id, camera_motion: { type: 'static', direction: 'none', speed: 'slow', magnitude: 'minimal' }, character_motion: motions.map((m) => ({ ...m, magnitude: 'medium' as const })), motion_prompt: '' },
  }
}
const dec = (shot_id: string, source_beats: number[]): DecoupageShot => ({
  shot_id, scene_id: 'scene_1', operation: 'derived', shot_function: 'action', source_beats, beat_summary: '', shot_size: 'MS', intended_duration_seconds: 5, rhythm_role: 'develop', camera_intent: 'static', dramatic_purpose: '',
})

describe('applyLedgerToShots', () => {
  // 비트 0: 수인 MS(남쪽에서) — 용족이 배경에 들어온다(무대 기하). 비트 3: 와이드 그룹.
  const shots = [
    shot('shot_2', { shot_type: 'MS', camera_setup: { subject: 'char_3', from_direction: 'S', height: 'low', lens_mm: 35 }, character_blocking: [{ character_id: 'char_3', position_in_frame: 'center', pose: 'lying', gaze: 'up', asset_version: 'v1' }] }, [{ character_id: 'char_3', verb: 'opens eyes and pushes up to sit' }]),
    shot('shot_5', { shot_type: 'WS', camera_setup: { subject: 'group', from_direction: 'S', height: 'eye', lens_mm: 35 }, character_blocking: [{ character_id: 'char_3', position_in_frame: 'center', pose: 'walking', gaze: 'ahead', asset_version: 'v1' }] }),
  ]
  const stage = normalizeStageTransitions(STAGE)
  const applied = applyStageToShots(shots, stage, [dec('shot_2', [0]), dec('shot_5', [3])], { format: 'horizontal_16:9' })
  const r = applyLedgerToShots(applied.shots, stage, NAMES)
  const t = (id: string, beat: number) => r.ledger.transitions.find((x) => x.character_id === id && x.beat === beat)!

  it('작가가 이미 적은 동작(수인 눈 뜸·일어나 앉음)은 보충하지 않고 "이미 있음"으로 기록', () => {
    expect(t('char_3', 0).covered).toBe(true)
    expect(t('char_3', 0).shown_by).toEqual(['shot_2'])
    expect(t('char_3', 0).injected_into).toEqual([])
    expect(r.issues.some((i) => i.location === 'shot_2' && i.message.includes('수인 수장') && i.message.includes('이미 있음'))).toBe(true)
  })

  it('프레임 안의 배경 인물(용족)의 누움→섬은 그 샷에 배경 동작으로 보충되고 visual 제약이 붙는다', () => {
    const tr = t('char', 0)
    expect(tr.covered).toBe(true)
    expect(tr.injected_into).toEqual(['shot_2'])
    const s2 = r.shots.find((s) => s.intent.shot_id === 'shot_2')!
    const m = s2.dynamic_spec.character_motion.find((x) => x.character_id === 'char')!
    expect(m.source).toBe('ledger')
    expect(m.verb).toContain('rises')
    const note = r.issues.find((i) => i.location === 'shot_2' && i.constraint_target === 'visual' && i.constraint?.includes('char)'))
    expect(note?.constraint).toContain('lying → standing')
  })

  it('프레임 밖 인물(요정)의 변화는 보여주는 샷이 없다 — report_only 경고', () => {
    const tr = t('char_2', 0)
    expect(tr.covered).toBe(false)
    const warn = r.issues.find((i) => i.constraint_target === 'report_only' && i.message.includes('요정 수장'))
    expect(warn).toBeTruthy()
    expect(warn!.message).toContain('보여주는 샷이 없다')
    expect(warn!.suggestion).toContain('비트 0')
  })

  it('이동(비트 3 수인 2.5m)은 와이드에서 보이고, 화면 기준 동작으로 보충된다', () => {
    const tr = t('char_3', 3)
    expect(tr.covered).toBe(true)
    expect(tr.injected_into).toEqual(['shot_5'])
    const s5 = r.shots.find((s) => s.intent.shot_id === 'shot_5')!
    const m = s5.dynamic_spec.character_motion.find((x) => x.character_id === 'char_3')!
    expect(m.verb).toMatch(/^walks/)
  })

  it('원본 shots 는 변형하지 않는다', () => {
    expect(applied.shots.find((s) => s.intent.shot_id === 'shot_2')!.dynamic_spec.character_motion.some((m) => m.character_id === 'char')).toBe(false)
  })
})
