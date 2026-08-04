// 인지 부하 기반 시간 재배분(#p2-pacing 2026-08-04) 회귀 — 진단: lab/previz-quality/REPORT.md §7
//
// 계약:
//   1. 재배분은 **증액만** 한다 — 저부하 롱테이크를 줄이지 않는다 (연출 의도 보존).
//   2. 대사 발화 시간(한글 ~4.5자/초, 라틴 ~13자/초 + 호흡)이 샷 길이에 반영된다 —
//      "2초 샷에 대사 1줄" (실측 6/26) 재발 방지.
//   3. 신규 인물 첫 등장·씬 오프닝은 리딩 타임을 가산받는다.
//   4. 상한(10s)은 persist 클램프와 정합 — 초장문 대사도 상한을 넘기지 않는다.
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
  it('대사 있는 2초 샷은 발화 시간만큼 증액된다', () => {
    // 한글 27자 → 27/4.5=6.0s + 호흡 0.5 + 문맥 1.0 ≈ 7.5 → ceil 8
    const line = '이 도면이 진짜라면 우리 마을의 가뭄은 전부 조작된 거야'
    const shots = [makeShot({ id: 'shot_1', dur: 2 })]
    const { shots: out, changed } = reallocateShotDurations(shots, new Map([dlg('shot_1', line)]))
    expect(out[0].duration_seconds).toBeGreaterThanOrEqual(7)
    expect(changed).toHaveLength(1)
  })

  it('저부하 롱테이크는 줄이지 않는다 (증액 전용)', () => {
    const shots = [makeShot({ id: 'shot_1', dur: 7 })]
    const { shots: out, changed } = reallocateShotDurations(shots, new Map())
    expect(out[0].duration_seconds).toBe(7)
    expect(changed).toHaveLength(0)
  })

  it('신규 인물 첫 등장 샷은 가산받고, 재등장은 가산 없다', () => {
    const shots = [
      makeShot({ id: 'shot_1', dur: 5, chars: ['girl'] }),
      makeShot({ id: 'shot_2', dur: 2, chars: ['girl', 'hunter'] }), // hunter 첫 등장 → 2.0+1.0=3.0
      makeShot({ id: 'shot_3', dur: 2, chars: ['hunter'] }), // 재등장 → 2.5 바닥
    ]
    const { shots: out } = reallocateShotDurations(shots, new Map())
    expect(out[1].duration_seconds).toBe(3)
    expect(out[2].duration_seconds).toBe(3) // ceil(2.5)
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
