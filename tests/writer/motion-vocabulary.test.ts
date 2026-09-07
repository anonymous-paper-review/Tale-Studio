// 모션 어휘 교정(#motion-vocab 2026-08-11) 회귀.
//
// 재현 대상은 실험 research/experiments/camera-follow-disambiguation 에서 실제로 나온 두 값이다:
//   ① camera_motion.type = "pan_right"           (정본은 type:"pan" + direction:"right")
//   ② character_motion[].magnitude = "moderate"  (인물 스케일의 가운데는 "medium")
// 두 값 모두 어휘 밖이라 소비처 4곳이 서로 다르게 조용히 열화됐다. 각 소비처가 이제 제대로
// 받는지를 여기서 한 번에 잠근다 — 근본 원인(지시서가 어휘를 3개만 보여줬다)은 코드로 못 잠그므로,
// 새는 순간 무엇이 깨지는지를 대신 잠근다.
import { describe, it, expect } from 'vitest'
import {
  normalizeCameraMotion,
  normalizeCharacterMagnitude,
  normalizeCameraMotionType,
  isCameraStatic,
  CAMERA_MOTION_TYPES,
  MOTION_VOCABULARY_GUIDE,
} from '@/lib/writer/motion-vocabulary'
import { compileMotionContract } from '@/lib/director/motion-contract'
import { motionExpectation } from '@/lib/adherence/core'
import { cameraConfigFromShotDesign } from '@/lib/writer/shot-config-from-design'
import type { ShotDynamicSpec, ShotDesign } from '@/lib/writer/types/pipeline'

/** 실험 hand_off_frame 케이스의 dynamic_spec 원문(어휘 밖 값 그대로). */
function panRightDyn(): ShotDynamicSpec {
  return {
    shot_id: 'shot_1',
    // 타입 계약상으론 없는 값 — 그래서 LLM 출력이 여기 실린다는 사실 자체가 이 테스트의 전제다.
    camera_motion: { type: 'pan_right' as never, direction: 'right', speed: 'slow', magnitude: 'medium' as never },
    character_motion: [{ character_id: 'char', verb: 'pulls', magnitude: 'medium' }],
    motion_prompt: 'Camera pans right following the extended hand to reveal a red lever.',
  }
}

describe('normalizeCameraMotionType', () => {
  it('pan_right → type "pan" + direction "right" 을 되살린다 (방향을 버리지 않는다)', () => {
    const r = normalizeCameraMotionType('pan_right')
    expect(r.type).toBe('pan')
    expect(r.mapped).toBe(true)
    expect(r.directionFromType).toBe('right')
  })

  it('업계 통용어를 정본으로 접는다', () => {
    expect(normalizeCameraMotionType('push_in').type).toBe('dolly_in')
    expect(normalizeCameraMotionType('pull back').type).toBe('dolly_out')
    expect(normalizeCameraMotionType('follow').type).toBe('tracking')
    expect(normalizeCameraMotionType('handheld').type).toBe('handheld_drift')
    expect(normalizeCameraMotionType('locked off').type).toBe('static')
    expect(normalizeCameraMotionType('tilt_up').directionFromType).toBe('up')
  })

  it('정본 9종은 손대지 않고 그대로 통과한다', () => {
    for (const t of CAMERA_MOTION_TYPES) {
      const r = normalizeCameraMotionType(t)
      expect(r.type).toBe(t)
      expect(r.mapped).toBe(true)
    }
  })

  it('못 알아본 유형은 static 으로 접지 않고 원문을 유지한다', () => {
    // 미상값을 정지로 접으면 설계된 이동이 소리 없이 사라지고, 계약문이 같은 프롬프트 안의
    //   장면 묘사문과 정면으로 모순된다 — 고치려는 사고의 더 나쁜 버전이다.
    const r = normalizeCameraMotionType('orbit_around_subject')
    expect(r.mapped).toBe(false)
    expect(r.type).not.toBe('static')
    expect(isCameraStatic({ type: r.type, mapped: false, direction: 'none', speed: 'slow', magnitude: 'minimal' })).toBe(false)
  })
})

describe('normalizeCharacterMagnitude', () => {
  it('카메라 스케일 낱말 "moderate" 를 인물 스케일 "medium" 으로 맞바꿔 받는다', () => {
    // 두 스케일의 가운데 낱말이 다른 게 함정: 카메라 minimal|moderate|large / 인물 micro|small|medium|large
    expect(normalizeCharacterMagnitude('moderate')).toBe('medium')
  })

  it('미상·누락은 최소가 아니라 medium 으로 둔다 (동작이 삼켜지지 않게)', () => {
    expect(normalizeCharacterMagnitude(undefined)).toBe('medium')
    expect(normalizeCharacterMagnitude('unbekannt')).toBe('medium')
  })

  it('진짜 최소를 뜻하는 낱말은 micro 로 남는다', () => {
    expect(normalizeCharacterMagnitude('micro')).toBe('micro')
    expect(normalizeCharacterMagnitude('minimal')).toBe('micro')
    expect(normalizeCharacterMagnitude('none')).toBe('micro')
  })
})

describe('normalizeCameraMotion — 멱등성과 기록', () => {
  it('정본 입력은 교정 기록이 비어 있다', () => {
    const { repairs } = normalizeCameraMotion({ type: 'pan', direction: 'right', speed: 'slow', magnitude: 'moderate' })
    expect(repairs).toEqual([])
  })

  it('한 번 교정한 값을 다시 통과시켜도 같다 (소비처가 몇 번 불러도 안전)', () => {
    const once = normalizeCameraMotion(panRightDyn().camera_motion).motion
    const twice = normalizeCameraMotion(once).motion
    expect(twice).toEqual(once)
    expect(normalizeCameraMotion(once).repairs).toEqual([])
  })

  it('교정한 내용을 사람이 읽을 수 있게 남긴다 (조용한 열화 금지)', () => {
    const { repairs } = normalizeCameraMotion(panRightDyn().camera_motion)
    expect(repairs.join(' ')).toContain('pan_right')
    expect(repairs.join(' ')).toContain('"pan"')
  })

  it('명시된 direction 이 유형에서 떼어낸 방향보다 우선한다', () => {
    const { motion } = normalizeCameraMotion({ type: 'pan_right', direction: 'left', speed: 'slow', magnitude: 'moderate' })
    expect(motion.direction).toBe('left')
  })
})

// ── 소비처별: 실험에서 실제로 깨졌던 지점 ────────────────────────────────────────────────

describe('소비처 ① 모션 계약문', () => {
  it('pan_right 이어도 pan 전용 절 "회전만 — 카메라는 이동하지 않는다" 가 살아남는다', () => {
    // 옛 코드: byType["pan_right"] 조회 실패 → 폴백 문장 → 이 절이 통째로 소실.
    //   회전(pan)과 이동(tracking)의 차이가 영상 모델에 전달되지 않았다.
    const text = compileMotionContract(panRightDyn(), 5).text
    expect(text).toContain('Rotation only — the camera does not travel')
    expect(text).toContain('pans slow')
  })

  it('pan_right 은 정지 계약이 아니다', () => {
    expect(compileMotionContract(panRightDyn(), 5).cameraStatic).toBe(false)
  })

  it('인물 magnitude "moderate" 가 "미세한 움직임" 으로 뒤집히지 않는다', () => {
    // 실측 사고: 설계는 "보통 크기 고갯짓"인데 발주문엔 "barely-perceptible micro movement" 로 나갔다.
    const dyn: ShotDynamicSpec = {
      shot_id: 'shot_1',
      camera_motion: { type: 'pan', direction: 'right', speed: 'medium', magnitude: 'moderate' },
      character_motion: [{ character_id: 'char', verb: 'turns head', magnitude: 'moderate' as never }],
      motion_prompt: '',
    }
    const text = compileMotionContract(dyn, 5).text
    expect(text).toContain('a clear movement that completes')
    expect(text).not.toContain('barely-perceptible')
  })

  it('tracking 은 pan 과 반대로 "카메라가 실제로 이동" 을 명시한다', () => {
    const dyn: ShotDynamicSpec = {
      shot_id: 'shot_1',
      camera_motion: { type: 'tracking', direction: 'right', speed: 'medium', magnitude: 'moderate' },
      character_motion: [],
      motion_prompt: '',
    }
    expect(compileMotionContract(dyn, 5).text).toContain('The camera itself travels')
  })
})

describe('소비처 ② 6축 카메라 컨트롤', () => {
  it('pan_right 이 더 이상 전 축 0 으로 떨어지지 않는다', () => {
    // 옛 코드: switch default → 전 축 0. 글로는 "오른쪽으로 팬", 숫자로는 "정지" 를 동시에 발주했다.
    const design = { static_spec: { camera_angle: 'eye_level' }, dynamic_spec: panRightDyn() } as unknown as ShotDesign
    const cam = cameraConfigFromShotDesign(design)
    expect(cam.tilt).not.toBe(0) // kling 6축 의미론에서 좌우 회전 = tilt(yaw)
    expect(cam.tilt).toBeGreaterThan(0) // direction "right" → 양수
  })
})

describe('소비처 ③ 준수 검수', () => {
  it('pan_right 도 방향 판정 대상에 들어온다 (검수기가 눈을 감지 않는다)', () => {
    // 옛 코드: ['pan','tilt','tracking','crane'] 화이트리스트에 없어 directional=null → 방향 검사 스킵.
    const exp = motionExpectation(panRightDyn())!
    expect(exp.cameraStatic).toBe(false)
    expect(exp.directional).toEqual({ type: 'pan', direction: 'right' })
  })
})

describe('지시서 어휘 블록', () => {
  it('정본 9종을 하나도 빠뜨리지 않고 싣는다 (말줄임표로 끝나던 자리)', () => {
    // 근본 원인은 지시서가 3종만 보여주고 `...` 로 끝난 것이었다.
    for (const t of CAMERA_MOTION_TYPES) {
      expect(MOTION_VOCABULARY_GUIDE).toContain(`"${t}"`)
    }
  })

  it('두 스케일의 가운데 낱말이 다르다는 것을 명시한다', () => {
    expect(MOTION_VOCABULARY_GUIDE).toContain('moderate')
    expect(MOTION_VOCABULARY_GUIDE).toContain('medium')
  })

  it('방향을 유형 이름에 붙이지 말라고 못박는다 (pan_right 의 직접 처방)', () => {
    expect(MOTION_VOCABULARY_GUIDE).toContain('pan_right')
  })
})
