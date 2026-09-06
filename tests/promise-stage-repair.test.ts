// 씬 무대 수리 (2026-09-05, 오너 결정: 1 전이 소유권 규칙 승인 · 2 근거 게이트는 작은 메모 · 3 기하 수리 승인 · 4 프레임 밖 봉인 승인)
//   문장 하나 = 테스트 하나. 겨울_6 씬 1 진단(2026-09-04)의 네 결함을 못박는다.
import { describe, expect, it } from 'vitest'
import { applyStageToShots, DISTANT_APPARENT_HEIGHT, pinStates } from '@/lib/writer/pipeline/stage/apply'
import {
  applyLedgerToShots,
  decideTransitionOwners,
  evidenceSupported,
  gateStageEvidence,
  normalizeStageTransitions,
  transitionKey,
  transitionPins,
} from '@/lib/writer/pipeline/stage/ledger'
import { runStageForScene } from '@/lib/writer/pipeline/stage/orchestrate'
import { WIDE_SHOT_RE, resolveSubjectPoints, solveCamera, DEFAULT_CHARACTER_HEIGHT_M } from '@/lib/writer/pipeline/stage/geometry'
import { buildRoughGridCell } from '@/lib/writer/rough-storyboard-grid'
import { pairKey, planShotCharacterRefs, readOffFrame } from '@/lib/director/shot-references'
import type { DecoupageShot, SceneStage, ShotDesign, ShotStaticSpec } from '@/lib/writer/types/pipeline'

// 겨울_6 씬 1 축약: 비트 0 에서 수인(char_3)이 누움→앉음. 설정 EWS(수인이 작게)와 수인 MS 가 같은 비트다.
const STAGE: SceneStage = {
  scene_id: 'scene_1', unit: 'm', landmarks: [{ id: 'floating_rock', label: 'floating rock cluster', x: 0, y: 30 }],
  axis: { from: 'char', to: 'char_2' }, camera_side: 'right',
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
  ],
}
const NAMES = new Map([['char', '용족 수장'], ['char_2', '요정 수장'], ['char_3', '수인 수장']])

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
const blockAll = ['char', 'char_2', 'char_3'].map((id) => ({ character_id: id, position_in_frame: 'center_third', pose: 'lying', gaze: 'up', asset_version: 'v1' }))
// 설정 EWS(표지 피사체, 인물 작게) + 수인 MS, 둘 다 비트 0.
const EWS = shot('shot_1', { shot_type: 'EWS', camera_setup: { subject: 'floating_rock', from_direction: 'S', height: 'eye', lens_mm: 24 }, character_blocking: blockAll })
const MS = shot('shot_2', { shot_type: 'MS', camera_setup: { subject: 'char_3', from_direction: 'S', height: 'low', lens_mm: 35 }, character_blocking: [blockAll[2]] })
const DEC = [dec('shot_1', [0]), dec('shot_2', [0])]

describe('1 전이 소유권 — 전이는 한 샷만 보여준다', () => {
  const stage = normalizeStageTransitions(STAGE)
  const r = runStageForScene([EWS, MS], stage, DEC, { format: 'horizontal_16:9', names: NAMES })
  const t = r.ledger.transitions.find((x) => x.character_id === 'char_3' && x.beat === 0)!
  const by = (id: string) => r.shots.find((s) => s.intent.shot_id === id)!

  it('수인의 누움→앉음은 수인이 크게 잡힌 MS 가 소유하고, 설정 EWS 에는 동작이 들어가지 않는다', () => {
    expect(t.owner).toBe('shot_2')
    expect(t.shown_by).toEqual(['shot_2'])
    expect(t.injected_into).toEqual(['shot_2'])
    expect(by('shot_1').dynamic_spec.character_motion.some((m) => m.character_id === 'char_3')).toBe(false)
  })

  it('소유 샷 앞의 샷은 START 상태로 고정된다 — EWS 의 END 에서 수인은 여전히 누워 있다', () => {
    const lay = by('shot_1').static_spec.screen_layout!
    const ch = lay.characters.find((c) => c.character_id === 'char_3')
    // 핀이 걸리면 START=END 라 END 배치가 따로 없거나 같다.
    expect(ch?.end === undefined || ch.end.posture === ch.start.posture).toBe(true)
    const pins = transitionPins(applyStageToShots([EWS, MS], stage, DEC, { format: 'horizontal_16:9' }).shots, stage, r.owners)
    expect(pins.get('shot_1')?.get('char_3')).toBe('start')
    expect(pins.get('shot_2')?.get('char_3')).toBeUndefined() // 소유 샷 자신은 핀이 없다
  })

  it('인물이 화면 높이 15% 미만인 샷은 소유에서 제외된다 — 다른 후보가 없을 때만 허용', () => {
    const applied = applyStageToShots([EWS, MS], stage, DEC, { format: 'horizontal_16:9' }).shots
    const ewsHeight = applied[0].static_spec.screen_layout!.characters.find((c) => c.character_id === 'char_3')!.start.apparent_height
    expect(ewsHeight).toBeLessThan(0.15)
    const onlyEws = decideTransitionOwners([applied[0]], stage)
    expect(onlyEws.get(transitionKey(0, 'char_3'))).toBe('shot_1') // 유일한 후보면 작아도 소유
    const both = decideTransitionOwners(applied, stage)
    expect(both.get(transitionKey(0, 'char_3'))).toBe('shot_2')
  })

  it('작가 동작이 적힌 샷이 있으면 크기보다 그 샷이 우선한다', () => {
    const ewsWithMotion = shot('shot_1', EWS.static_spec, [{ character_id: 'char_3', verb: 'pushes up to sit' }])
    const applied = applyStageToShots([ewsWithMotion, MS], stage, DEC, { format: 'horizontal_16:9' }).shots
    // 15% 미만이라 제외되는 EWS 는 작가 동작이 있어도 못 가진다 — 후보(MS)가 있으므로.
    expect(decideTransitionOwners(applied, stage).get(transitionKey(0, 'char_3'))).toBe('shot_2')
    const msWithMotion = shot('shot_2', MS.static_spec, [{ character_id: 'char_3', verb: 'pushes up to sit' }])
    const ws = shot('shot_3', { shot_type: 'WS', camera_setup: { subject: 'group', from_direction: 'S', height: 'eye', lens_mm: 35 }, character_blocking: blockAll })
    const applied2 = applyStageToShots([ws, msWithMotion], stage, [dec('shot_3', [0]), dec('shot_2', [0])], { format: 'horizontal_16:9' }).shots
    expect(decideTransitionOwners(applied2, stage).get(transitionKey(0, 'char_3'))).toBe('shot_2')
  })

  it('핀은 소유 샷 앞이면 시작 상태, 뒤면 끝 상태로 인물을 고정한다', () => {
    const states = { start: STAGE.beats[0].characters, end: STAGE.beats[0].end_characters!, beatUsed: 0 }
    const pinnedStart = pinStates(states, new Map([['char_3', 'start' as const]]))
    expect(pinnedStart.end.find((c) => c.character_id === 'char_3')!.posture).toBe('lying')
    const pinnedEnd = pinStates(states, new Map([['char_3', 'end' as const]]))
    expect(pinnedEnd.start.find((c) => c.character_id === 'char_3')!.posture).toBe('sitting')
  })
})

describe('2 근거 게이트 — 근거 없는 변화는 버리고 메모로만 남긴다', () => {
  const texts = ['세 수장이 흩어져 누워 있다.', '수인 수장이 몸을 일으켜 앉는다.', '셋이 무기를 고쳐 잡으며 대치한다.']
  const v2 = (over: Partial<SceneStage>): SceneStage => ({ ...STAGE, version: 2, ...over })

  it('원문에 없는 변화(셋 다 웅크림)는 직전 상태로 되돌리고 gated_note 메모만 남는다', () => {
    const beat0End = STAGE.beats[0].end_characters!.map((c) => (c.character_id === 'char_3' ? { ...c, evidence: '몸을 일으켜 앉는다' } : c))
    const stage = v2({
      beats: [
        { ...STAGE.beats[0], end_characters: beat0End },
        {
          beat: 2,
          characters: beat0End.map((c) => ({ ...c, evidence: undefined })),
          end_characters: beat0End.map((c) => ({ ...c, posture: 'crouching' as const, evidence: '자세를 낮춘다' })),
        },
      ],
    })
    const r = gateStageEvidence(stage, texts, NAMES)
    const b2 = r.stage.beats.find((b) => b.beat === 2)!
    for (const c of b2.end_characters!) {
      const start = b2.characters.find((x) => x.character_id === c.character_id)!
      expect(c.posture).toBe(start.posture)
      expect(c.gated_note).toMatch(/→ crouching/)
    }
    expect(r.issues.filter((i) => i.constraint_target === 'report_only' && i.message.includes('근거 게이트'))).toHaveLength(3)
    // 메모는 프롬프트 재료(note)가 아니다.
    expect(b2.end_characters![0].note).toBeUndefined()
  })

  it('원문에 근거가 있으면(인용이 원문에 있으면) 변화가 유지된다', () => {
    const stage = v2({
      beats: [
        { ...STAGE.beats[0], end_characters: STAGE.beats[0].end_characters!.map((c) => (c.character_id === 'char_3' ? { ...c, evidence: '몸을 일으켜 앉는다' } : c)) },
      ],
    })
    const r = gateStageEvidence(stage, texts, NAMES)
    expect(r.stage.beats[0].end_characters!.find((c) => c.character_id === 'char_3')!.posture).toBe('sitting')
    expect(r.issues).toEqual([])
    expect(evidenceSupported('수인 수장이 몸을 일으켜', texts)).toBe(true)
    expect(evidenceSupported('일으켜 앉음', texts)).toBe(true) // 작은 바꿔쓰기 허용
    expect(evidenceSupported('웅크린다', texts)).toBe(false)
    expect(evidenceSupported(undefined, texts)).toBe(false)
  })

  it('비트 사이의 근거 없는 변화(다음 비트 시작이 직전 끝과 다름)도 되돌린다', () => {
    // 비트 0 끝의 수인 앉음은 근거가 있고, 비트 1 시작에 용족·요정이 서 있는 것은 근거가 없다.
    const stage = v2({ beats: [{ ...STAGE.beats[0], end_characters: STAGE.beats[0].end_characters!.map((c) => (c.character_id === 'char_3' ? { ...c, evidence: '몸을 일으켜 앉는다' } : c)) }, STAGE.beats[1]] })
    const r = gateStageEvidence(stage, texts, NAMES)
    const b1 = r.stage.beats.find((b) => b.beat === 1)!
    expect(b1.characters.find((c) => c.character_id === 'char')!.posture).toBe('lying')
    expect(b1.characters.find((c) => c.character_id === 'char_2')!.posture).toBe('lying')
    expect(b1.characters.find((c) => c.character_id === 'char_3')!.posture).toBe('sitting') // 비트 0 끝과 같아 변화 아님
  })

  it('옛 무대(version 없음)에는 게이트를 걸지 않는다', () => {
    const r = gateStageEvidence(STAGE, texts, NAMES)
    expect(r.stage).toBe(STAGE)
    expect(r.issues).toEqual([])
  })
})

describe('3 기하 수리', () => {
  it('표지 피사체는 거리 계산에 인물 키를 쓴다', () => {
    const pts = resolveSubjectPoints('floating_rock', STAGE.beats[0].characters, STAGE.landmarks)
    expect(pts).toEqual([{ x: 0, y: 30, height: DEFAULT_CHARACTER_HEIGHT_M, id: 'floating_rock' }])
  })

  it('와이드 샷에서 피사체가 표지뿐인데 인물 명단이 있으면 피사체는 인물과 표지의 합집합이다', () => {
    const setup = { subject: 'floating_rock', from_direction: 'S' as const, height: 'eye' as const, lens_mm: 24 }
    const onlyRock = solveCamera({ setup, shotType: 'EWS', aspect: 16 / 9, stage: STAGE, states: STAGE.beats[0].characters })
    const withPeople = solveCamera({ setup, shotType: 'EWS', aspect: 16 / 9, stage: STAGE, states: STAGE.beats[0].characters, intendedIds: ['char', 'char_2', 'char_3'] })
    // 합집합이면 피사체 중심이 인물 쪽으로 당겨지고, 인물이 퍼진 만큼 더 물러선다.
    expect(withPeople.subjectCenter.y).toBeLessThan(onlyRock.subjectCenter.y)
    expect(withPeople.subjectDistance).toBeGreaterThan(onlyRock.subjectDistance)
    expect(WIDE_SHOT_RE.test('EWS')).toBe(true)
    expect(WIDE_SHOT_RE.test('MCU')).toBe(false)
    const mcu = solveCamera({ setup, shotType: 'MCU', aspect: 16 / 9, stage: STAGE, states: STAGE.beats[0].characters, intendedIds: ['char'] })
    expect(mcu.subjectCenter).toEqual(onlyRock.subjectCenter) // 타이트 샷은 합집합을 강제하지 않는다
  })

  it('화면 높이 8% 미만으로 작아지는 인물은 명단에서 빠지고 "먼 인물"로만 쓰인다', () => {
    // 표지에서 30m 떨어진 세 인물 — 표지 피사체 EWS 에서는 아주 작다.
    const far = shot('shot_far', { shot_type: 'EWS', camera_setup: { subject: 'floating_rock', from_direction: 'N', height: 'eye', lens_mm: 24 }, character_blocking: blockAll })
    const r = applyStageToShots([far], STAGE, [dec('shot_far', [0])], { format: 'horizontal_16:9' })
    const lay = r.shots[0].static_spec.screen_layout!
    const distant = lay.characters.filter((c) => c.distant)
    expect(distant.length).toBeGreaterThan(0)
    for (const c of distant) {
      expect(c.start.apparent_height).toBeLessThan(DISTANT_APPARENT_HEIGHT)
      expect(r.shots[0].static_spec.character_blocking.some((b) => b.character_id === c.character_id)).toBe(false)
    }
    const cell = buildRoughGridCell(
      { shotType: 'EWS', actionDescription: 'three leaders lie scattered', characterNames: ['용족 수장', '요정 수장', '수인 수장'], characterNameById: NAMES, spec: { staticSpec: r.shots[0].static_spec, dynamicSpec: r.shots[0].dynamic_spec } },
      'shot_far',
    )
    expect(cell.start).toMatch(/distant figure/)
    expect(cell.start).toMatch(/unnumbered silhouettes only/)
  })
})

describe('4 프레임 밖 인물 봉인', () => {
  // 수인 MS(남쪽에서, 로우): 용족·요정은 카메라 밖.
  const r = applyStageToShots([MS], normalizeStageTransitions(STAGE), [dec('shot_2', [0])], { format: 'horizontal_16:9', names: NAMES })
  const lay = r.shots[0].static_spec.screen_layout!

  it('명단에서 뺀 인물은 screen_layout.off_frame 에 남고 "그리지 말 것" 시각 제약이 붙는다', () => {
    expect(lay.off_frame).toEqual(['char_2']) // 용족은 배경에 들어온다(무대 기하), 요정만 카메라 밖
    const notes = r.issues.filter((i) => i.location === 'shot_2' && i.constraint_target === 'visual' && /OFF-SCREEN/.test(i.constraint ?? ''))
    expect(notes.map((n) => n.constraint)).toEqual([expect.stringContaining('요정 수장 (char_2) is OFF-SCREEN')])
    expect(notes.every((n) => n.severity === 'WARNING')).toBe(true) // INFO 는 check_notes 에 실리지 않는다
  })

  it('러프 셀은 프레임 밖 인물을 이름으로 대고 그리지 말라고 못박고, 실사 참조에서 그 인물의 시트를 뺀다', () => {
    const cell = buildRoughGridCell(
      { shotType: 'MS', actionDescription: 'the three leaders face off', characterNames: ['용족 수장', '요정 수장', '수인 수장'], characterNameById: NAMES, spec: { staticSpec: r.shots[0].static_spec, dynamicSpec: r.shots[0].dynamic_spec } },
      'shot_2',
    )
    expect(cell.start).toMatch(/OFF-SCREEN in this shot \(do not draw them at all\): 요정 수장/)
    expect(readOffFrame(r.shots[0].static_spec)).toEqual(lay.off_frame)
    const plan = planShotCharacterRefs(
      { shot_id: 'shot_2', characters: ['char', 'char_2', 'char_3'], character_appearance_keys: { char: 'current', char_2: 'current', char_3: 'current' }, static_spec: r.shots[0].static_spec },
      { characterById: new Map([['char', { name: 'A' }], ['char_2', { name: 'B' }], ['char_3', { name: 'C' }]]), sheetByPair: new Map([[pairKey('char', 'current'), 'https://x/a.png'], [pairKey('char_2', 'current'), 'https://x/b.png'], [pairKey('char_3', 'current'), 'https://x/c.png']]), defaultKeyById: new Map() },
    )
    expect(plan.characterRefs.map((c) => c.characterId)).toEqual(['char', 'char_3'])
  })

  it('START 에 없고 END 에 들어오는 인물은 "가장자리 바로 밖"이 아니라 "START 에는 안 보임, 왼쪽에서 진입"으로 적힌다', () => {
    const st = r.shots[0].static_spec
    const entering: ShotStaticSpec = {
      ...st,
      character_blocking: [...st.character_blocking, { character_id: 'char', position_in_frame: 'off_left', pose: 'walking', gaze: 'ahead', asset_version: 'v1' }],
      screen_layout: {
        ...st.screen_layout!,
        characters: [
          ...st.screen_layout!.characters,
          {
            character_id: 'char',
            start: { in_frame: false, screen_x: -1.4, screen_y: -0.5, distance_m: 4, apparent_height: 0.5, position_in_frame: 'off_left', depth_band: 'midground', facing: 'profile_right' },
            end: { in_frame: true, screen_x: -0.5, screen_y: -0.5, distance_m: 4, apparent_height: 0.5, position_in_frame: 'left_third', depth_band: 'midground', facing: 'profile_right' },
          },
        ],
      },
    }
    const cell = buildRoughGridCell(
      { shotType: 'MS', actionDescription: 'the dragon leader steps in', characterNames: ['용족 수장', '수인 수장'], characterNameById: NAMES, spec: { staticSpec: entering, dynamicSpec: r.shots[0].dynamic_spec } },
      'shot_2',
    )
    expect(cell.start).toMatch(/NOT visible at START \(off-screen left\); enters from the left/)
    expect(cell.start).not.toMatch(/just outside the left edge/)
  })
})
