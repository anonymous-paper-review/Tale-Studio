// 영상 모션 계약(#motion-contract 2026-08-07) 회귀.
//   증상 3종의 처방 검증: ① static 인데 움직임 → LOCKED 계약 ② 화살표 반대 → 화면 기준 방향
//   중의성 제거 ③ 시간 대비 변화 부족 → duration 스케일 + 완료 조항. 미전달=빈 계약(레거시 불변).
import { describe, it, expect } from 'vitest'
import { compileMotionContract } from '@/lib/director/motion-contract'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

function dyn(over: Partial<ShotDynamicSpec> = {}): ShotDynamicSpec {
  return {
    shot_id: 'sh_01_01',
    camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' },
    character_motion: [],
    motion_prompt: '',
    ...over,
  }
}

describe('compileMotionContract', () => {
  it('static 카메라 → LOCKED 계약 + cameraStatic=true (증상①의 처방)', () => {
    const c = compileMotionContract(dyn(), 6)
    expect(c.cameraStatic).toBe(true)
    expect(c.text).toContain('LOCKED tripod shot')
    expect(c.text).toContain('zero camera movement')
    // 정지여도 얼어붙지 않게 — 미세 생명감 조항
    expect(c.text).toContain('never frozen')
  })

  it('handheld_drift 는 이동 없음 취급(cameraStatic=true) + 여행 금지 문구', () => {
    const c = compileMotionContract(dyn({ camera_motion: { type: 'handheld_drift', speed: 'slow', magnitude: 'minimal' } }), 5)
    expect(c.cameraStatic).toBe(true)
    expect(c.text).toContain('never travels')
  })

  it('pan 방향은 시야·화면 콘텐츠 양방향으로 못박는다 (증상②의 처방)', () => {
    const c = compileMotionContract(
      dyn({ camera_motion: { type: 'pan', direction: 'left_to_right', speed: 'slow', magnitude: 'moderate' } }),
      6,
    )
    expect(c.cameraStatic).toBe(false)
    expect(c.text).toContain('toward screen right')
    expect(c.text).toContain('flows toward screen left')
    expect(c.text).toContain('does not travel') // pan = 회전만
  })

  it('duration 스케일 + 완료 조항이 실린다 (증상③의 처방)', () => {
    const c = compileMotionContract(
      dyn({
        camera_motion: { type: 'tracking', direction: 'forward', speed: 'medium', magnitude: 'large' },
        character_motion: [{ character_id: 'char', verb: 'pulls the shard free', magnitude: 'large' }],
      }),
      8,
    )
    expect(c.text).toContain('over the full 8 seconds')
    expect(c.text).toContain('8-second duration')
    expect(c.text).toContain('fully completed')
    expect(c.text).toContain('"pulls the shard free"')
    expect(c.text).toContain('large, clearly visible movement')
  })

  it('시선 arc·환경 변화도 계약에 실린다', () => {
    const c = compileMotionContract(
      dyn({
        gaze_arc: [{ character_id: 'char', from: 'down', to: 'toward_horizon' }],
        environmental_change: [{ type: 'rain_intensifies', magnitude: 'strong' }],
      }),
      5,
    )
    expect(c.text).toContain('gaze turns from down to toward horizon')
    expect(c.text).toContain('rain intensifies')
  })

  it('금지절(계약 외 카메라·인물·액션 지어내기 금지)이 항상 붙는다', () => {
    const text = compileMotionContract(dyn(), 5).text
    expect(text).toContain('Do NOT invent camera movement')
    // #motion-vocab 2026-08-11: 금지 범위에 "뒤따르는 장면 묘사문"을 명시적으로 포함시킨다.
    //   옛 문구("beyond this contract")는 이 계약문을 프롬프트의 유일한 권위로 선언해,
    //   뒤에 붙는 모델의 장면 묘사문(motion_prompt — "레버를 드러낸다" 같은 연출 목적이
    //   거기에만 있다)까지 계약 위반처럼 읽히게 했다.
    expect(text).toContain('and the scene description that follows')
  })

  it('dyn 미전달 → 빈 계약 (레거시 경로 불변)', () => {
    const c = compileMotionContract(null, 5)
    expect(c.text).toBe('')
    expect(c.cameraStatic).toBe(false)
  })
})

describe('buildVideoPrompt × 모션 계약', () => {
  const base = {
    prompt: 'A girl stands on a dune at dusk',
    generationMethod: 'I2V' as const,
    modelKey: 'kling-o3' as const,
    durationSeconds: 6,
    startEndReference: true,
  }

  it('P0: 정지 계약이면 START/END 수렴 지시가 "구도 유지" 분기로 바뀐다', () => {
    const r = buildVideoPrompt({ ...base, dynamicSpec: dyn() })
    expect(r.prompt_parts.startEnd).toContain('hold this same composition')
    expect(r.prompt_parts.startEnd).not.toContain('one continuous camera and subject movement')
  })

  it('이동 계약이면 기존 연속 이동 수렴 지시 유지', () => {
    const r = buildVideoPrompt({
      ...base,
      dynamicSpec: dyn({ camera_motion: { type: 'dolly_in', speed: 'slow', magnitude: 'moderate' } }),
    })
    expect(r.prompt_parts.startEnd).toContain('one continuous camera and subject movement')
  })

  it('계약문이 프롬프트 맨 앞에 실린다', () => {
    const r = buildVideoPrompt({ ...base, dynamicSpec: dyn() })
    expect(r.fullPrompt.startsWith('Motion contract:')).toBe(true)
    expect(r.prompt_parts.motionContract).toContain('LOCKED tripod shot')
  })

  it('dynamicSpec 미전달 → 기존 프롬프트와 완전히 동일 (레거시 불변)', () => {
    const withOut = buildVideoPrompt({ ...base })
    expect(withOut.fullPrompt).not.toContain('Motion contract')
    expect(withOut.prompt_parts.motionContract).toBeUndefined()
    expect(withOut.prompt_parts.startEnd).toContain('one continuous camera and subject movement')
  })
})
