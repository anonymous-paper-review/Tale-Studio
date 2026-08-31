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
import { detectLadderJumpIssues } from '@/lib/writer/pipeline/stages/c_application_2'
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
