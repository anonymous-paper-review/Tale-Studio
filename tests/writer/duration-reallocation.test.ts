// 인지 부하 기반 시간 재배분(#p2-pacing 2026-08-04 → #duration-surgery 2026-08-31 개정) 회귀.
//
// 계약 (2026-08-31 오너 확정):
//   1. **양방향 밴드** — 부족하면 ceil(needed)까지 증액, ceil(needed)+slack(2s) 초과분은 그
//      경계까지 감액. pacing_intent='long_take' 는 감액 면제(증액은 적용).
//   2. 대사 = 실발화 1배(한글 ~4.5자/초, 라틴 ~13자/초) + 고정 여백 0.5s — 종전 이중 여백
//      (호흡 0.5 + 문맥 1.0 = 1.5s, 실측 1.9배 과대) 폐지.
//   3. needed 는 dynamic_spec 의 동사별 magnitude 를 실제로 읽는다(micro 0.6/small 1.2/
//      medium 2.0/large 3.0 + base 1.2). 스펙 미보유만 종전 근사 폴백.
//   4. 신규 인물 첫 등장·씬 오프닝 가산, 바닥 2s(인서트), 상한 10s — persist 클램프 정합.
//   5. 급전환 검출은 같은 씬 인접 3단계↑ 점프만 잡고, 인서트 복귀 문법은 면제한다.
import { describe, it, expect } from 'vitest'
import {
  reallocateShotDurations,
  speechSecondsForText,
  REALLOC_MAX_SHOT_SECONDS,
} from '@/lib/writer/pipeline/util/duration_reallocation'
import { detectCoverageGapIssues, detectEmotionChainIssues, detectLadderJumpIssues } from '@/lib/writer/pipeline/stages/c_application_2'
import type { ShotSequenceItem, ShotDialogue } from '@/lib/writer/types/pipeline'

function makeShot(overrides: {
  id: string
  scene?: string
  dur: number
  type?: string
  chars?: string[]
  secondary?: number
  camera?: 'none' | 'simple' | 'complex'
}): ShotSequenceItem {
  return {
    shot_id: overrides.id,
    duration_seconds: overrides.dur,
    S: {
      scene_id: overrides.scene ?? 'scene_1',
      scene_purpose: '',
      emotion_beat: { start: '', end: '' },
      character_action: 'action',
    },
    C: { causal_link: { from: null, to: null }, info_disclosure: '' },
    V: {
      camera: { type: overrides.type ?? 'MS', angle: 'eye_level', movement: 'static' },
      lighting: { key_fill_ratio: '', color_temp: '' },
      composition: '',
      mood: '',
    },
    assets: {
      characters: (overrides.chars ?? []).map((id) => ({ id, asset_version: 'v1' })),
      locations: [],
    },
    first_frame_generation: { base_assets: [], composition_prompt: 'frame' },
    video_generation: { motion_prompt: 'motion' },
    action_budget: {
      primary_action_count: 1,
      secondary_action_count: overrides.secondary ?? 0,
      camera_movement_complexity: overrides.camera ?? 'none',
      environmental_changes: 0,
      passed_validation: true,
    },
    continuity: { carry_forward_from: null, consistent_elements: [], changes: [], is_scene_transition: false },
  } as ShotSequenceItem
}

function dlg(shotId: string, line: string): [string, ShotDialogue] {
  return [shotId, { shot_id: shotId, dialogue: [{ character_id: 'char', line }] } as ShotDialogue]
}

describe('reallocateShotDurations — 인지 부하 규칙', () => {
  it('대사 있는 2초 샷은 실발화+0.5s 로 증액된다 (이중 여백 폐지)', () => {
    // 한글 23자 → 23/4.5≈5.1s + 여백 0.5 = 5.6 → ceil 6 (종전 이중 여백이면 7이었다)
    const line = '이 도면이 진짜라면 우리 마을의 가뭄은 전부 조작된 거야'
    const shots = [makeShot({ id: 'shot_1', dur: 2 })]
    const { shots: out, changed } = reallocateShotDurations(shots, new Map([dlg('shot_1', line)]))
    expect(out[0].duration_seconds).toBe(6)
    expect(changed).toHaveLength(1)
  })

  it('과대 배정은 ceil(needed)+slack 까지 감액된다 (양방향 밴드)', () => {
    // 액션 2.0 + 오프닝 1.0 = 3.0 → ceil 3, slack 2 ⇒ 7s 배정은 5s 로 감액
    const shots = [makeShot({ id: 'shot_1', dur: 7 })]
    const { shots: out, changed } = reallocateShotDurations(shots, new Map())
    expect(out[0].duration_seconds).toBe(5)
    expect(changed).toHaveLength(1)
  })

  it("pacing_intent='long_take' 는 감액을 면제받는다 (연출 의도 보존)", () => {
    const shot = { ...makeShot({ id: 'shot_1', dur: 9 }), pacing_intent: 'long_take' as const }
    const { shots: out, changed } = reallocateShotDurations([shot], new Map())
    expect(out[0].duration_seconds).toBe(9)
    expect(changed).toHaveLength(0)
  })

  it('dynamic_spec 이 있으면 동사별 magnitude 를 실제로 읽는다', () => {
    // base 1.2 + large 3.0 + medium 2.0 + 오프닝 1.0 = 7.2 → ceil 8
    const shot = {
      ...makeShot({ id: 'shot_1', dur: 3 }),
      dynamic_spec: {
        character_motion: [
          { verb: 'bursts through the door', magnitude: 'large', character_id: 'c1' },
          { verb: 'kneels', magnitude: 'medium', character_id: 'c1' },
        ],
        camera_motion: { type: 'static' },
      },
    } as never as import('@/lib/writer/types/pipeline').ShotSequenceItem
    const { shots: out } = reallocateShotDurations([shot], new Map())
    expect(out[0].duration_seconds).toBe(8)
  })

  it('신규 인물 첫 등장 샷은 가산받고, 재등장은 가산 없다', () => {
    const shots = [
      makeShot({ id: 'shot_1', dur: 5, chars: ['girl'] }),
      makeShot({ id: 'shot_2', dur: 2, chars: ['girl', 'hunter'] }), // hunter 첫 등장 → 2.0+1.0=3.0
      makeShot({ id: 'shot_3', dur: 2, chars: ['hunter'] }), // 재등장 → 바닥 2s
    ]
    const { shots: out } = reallocateShotDurations(shots, new Map())
    expect(out[1].duration_seconds).toBe(3)
    expect(out[2].duration_seconds).toBe(2) // 바닥 2s (오너 루브릭: 인서트 = 2초)
  })

  it('초장문 대사도 상한(10s)을 넘지 않는다', () => {
    const line = '가뭄은 자연재해가 아니었어. '.repeat(10)
    const shots = [makeShot({ id: 'shot_1', dur: 3 })]
    const { shots: out } = reallocateShotDurations(shots, new Map([dlg('shot_1', line)]))
    expect(out[0].duration_seconds).toBe(REALLOC_MAX_SHOT_SECONDS)
  })

  it('라틴 스크립트는 빠른 발화 속도로 계산된다', () => {
    expect(speechSecondsForText('가뭄은 조작이다')).toBeGreaterThan(
      speechSecondsForText('Drought is fake'),
    )
  })
})

describe('detectLadderJumpIssues — 급전환 검출', () => {
  it('같은 씬 3단계↑ 점프는 WARNING, 씬 경계는 무시한다', () => {
    const shots = [
      makeShot({ id: 'shot_1', dur: 5, type: 'EWS' }),
      makeShot({ id: 'shot_2', dur: 4, type: 'MCU' }), // 6→2 = 4단계, 다음이 복귀 아님
      makeShot({ id: 'shot_3', dur: 4, type: 'CU' }),
      makeShot({ id: 'shot_4', dur: 5, type: 'EWS', scene: 'scene_2' }), // 씬 경계 — 무시
    ]
    const issues = detectLadderJumpIssues(shots)
    expect(issues).toHaveLength(1)
    expect(issues[0].location).toBe('shot_1→shot_2')
    expect(issues[0].constraint).toBeUndefined() // report 전용 — 프롬프트 미오염
  })

  it('인서트 복귀 문법(MS→ECU→MS)은 면제된다', () => {
    const shots = [
      makeShot({ id: 'shot_1', dur: 4, type: 'MS' }),
      makeShot({ id: 'shot_2', dur: 2, type: 'ECU' }),
      makeShot({ id: 'shot_3', dur: 4, type: 'MS' }),
    ]
    expect(detectLadderJumpIssues(shots)).toHaveLength(0)
  })
})

describe('detectEmotionChainIssues — 감정 연쇄 단절 검출 (#story-2)', () => {
  const arc = (id: string, from: string, to: string, scene = 'scene_1') => ({
    ...makeShot({ id, dur: 4, scene }),
    emotion_arc: { from, to },
  })

  it('같은 씬에서 to→from 이 끊기면 WARNING, 이어지면 무경고', () => {
    const broken = detectEmotionChainIssues([arc('s1', 'warmth', 'warmth'), arc('s2', 'dread', 'dread')])
    expect(broken).toHaveLength(1)
    expect(broken[0].location).toBe('s1→s2')
    expect(broken[0].category).toBe('continuity')
    const chained = detectEmotionChainIssues([arc('s1', 'warmth', 'unease'), arc('s2', 'unease', 'dread')])
    expect(chained).toHaveLength(0)
  })

  it('씬 경계와 arc 미출력(분할 자식·구 산출)은 건너뛴다', () => {
    expect(detectEmotionChainIssues([arc('s1', 'a', 'b'), arc('s2', 'c', 'd', 'scene_2')])).toHaveLength(0)
    expect(detectEmotionChainIssues([arc('s1', 'a', 'b'), makeShot({ id: 's2', dur: 4 })])).toHaveLength(0)
  })
})

describe('detectCoverageGapIssues — 커버리지 결함 검출 (#coverage-first)', () => {
  // 실제 산문 shape(리뷰 §3): 파이프라인은 slug 가 아니라 이름(소녀·노인)으로 쓴다 — 이름 매칭이 진짜 경로.
  const scenes = {
    scenes: [
      {
        scene_id: 'scene_1',
        characters_in_scene: ['pawnbroker', 'girl'],
        scene_actions: [
          '소녀가 고개를 들어 노인을 쳐다본다.',
          '소녀가 당황하며 뒷걸음질하자 노인이 희미하게 미소 짓는다.',
        ],
      },
    ],
  } as never as import('@/lib/writer/types/pipeline').Scenes
  const characters = {
    characters: [
      { id: 'pawnbroker', name: '노인' },
      { id: 'girl', name: '소녀' },
    ],
  } as never as import('@/lib/writer/types/pipeline').Characters
  const shot = (id: string, beats: number[], fn: string, movement = 'static') => ({
    ...makeShot({ id, dur: 5 }),
    V: { camera: { type: 'MS', angle: 'eye_level', movement }, lighting: { key_fill_ratio: '', color_temp: '' }, composition: '', mood: '' },
    source_beats: beats,
    shot_function: fn,
  }) as never as import('@/lib/writer/types/pipeline').ShotSequenceItem

  it('실측 재현: 시선 비트 정지 단독 샷 + 반응 없는 다인 비트 → 경고 2건', () => {
    const issues = detectCoverageGapIssues([shot('s2', [0], 'reveal'), shot('s3', [1], 'master')], scenes, characters)
    // s2: '살핀다' 정지 카메라, 다음 샷(s3)이 reveal/pov 가 아님 → 시선 리빌 부재
    // s3: char_2·char_3 다인 비트인데 반응 샷 없음
    expect(issues.map((i) => i.location)).toEqual(['s2', 's3'])
    expect(issues[0].message).toContain('시선')
    expect(issues[1].message).toContain('다인')
  })

  it('시선을 따라가는 카메라 무브 또는 뒤따르는 reveal/reaction 샷이 있으면 무경고', () => {
    const ok = detectCoverageGapIssues(
      [shot('s2', [0], 'reveal', 'pan'), shot('s3', [1], 'master'), shot('s4', [1], 'reaction')],
      scenes,
      characters,
    )
    expect(ok).toHaveLength(0)
  })

  it('source_beats 미운반(구 산출·분할 자식)은 판단하지 않는다', () => {
    expect(detectCoverageGapIssues([makeShot({ id: 's1', dur: 5 })], scenes, characters)).toHaveLength(0)
  })
})

describe('detectCoverageGapIssues — 이름 머리명사 매칭 (리뷰 §3 2차)', () => {
  it('"전당포 노인" 캐릭터가 산문의 "노인이"로, "추적자들"이 "추적자가"로 잡힌다', () => {
    const scenes = {
      scenes: [{
        scene_id: 'scene_1',
        characters_in_scene: ['pawnbroker', 'girl', 'hunters'],
        scene_actions: ['노인이 귀찮은 듯 돋보기 안경을 고쳐 쓰며 소녀에게 손을 내민다.', '추적자가 문을 부수고 들어온다.'],
      }],
    } as never as import('@/lib/writer/types/pipeline').Scenes
    const characters = {
      characters: [{ id: 'pawnbroker', name: '전당포 노인' }, { id: 'girl', name: '소녀' }, { id: 'hunters', name: '오아시스 추적자들' }],
    } as never as import('@/lib/writer/types/pipeline').Characters
    const shot = (id: string, beats: number[]) => ({
      ...makeShot({ id, dur: 5 }),
      source_beats: beats,
      shot_function: 'action',
    }) as never as import('@/lib/writer/types/pipeline').ShotSequenceItem
    const issues = detectCoverageGapIssues([shot('s1', [0]), shot('s2', [1])], scenes, characters)
    // beat 0: 노인+소녀 다인 비트, 반응 없음 → 경고 / beat 1: 추적자 단독 → 무경고
    expect(issues).toHaveLength(1)
    expect(issues[0].location).toBe('s1')
    expect(issues[0].message).toContain('pawnbroker, girl')
  })
})
