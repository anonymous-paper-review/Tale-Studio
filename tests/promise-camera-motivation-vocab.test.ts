// 카메라 동기 — 여섯으로 닫힌 목록 (2026-09-07, 오너 결정 1번: "동기 목록을 닫는다")
//
//   카메라가 움직이는 샷은 emphasis | emotion | reveal | energy | pov | long_take 중 하나를 대야 하고, 동기가
//   움직임의 꼴(종류·속도·진폭)을 정한다. 동기 없는 무브는 코드가 정지로 접고 기록을 남긴다. 문장 하나 = 테스트 하나.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  CAMERA_MOTIVATIONS,
  cameraWhyClause,
  coerceMotionForMotivation,
  normalizeCameraMotion,
  normalizeCameraMotivation,
} from '@/lib/writer/motion-vocabulary'
import { coerceDecoupageCamera, enforceCameraMotivation } from '@/lib/writer/pipeline/util/camera_motivation'
import { buildSystemInstruction } from '@/lib/writer/pipeline/stages/decoupage'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

describe('동기 어휘는 여섯으로 닫힌다', () => {
  it('정본 여섯 값과 분명한 동의어·한국어 표현만 동기로 인정하고, 나머지는 null 이다', () => {
    expect([...CAMERA_MOTIVATIONS]).toEqual(['emphasis', 'emotion', 'reveal', 'energy', 'pov', 'long_take'])
    expect(normalizeCameraMotivation('reveal')).toBe('reveal')
    expect(normalizeCameraMotivation('point of view')).toBe('pov')
    expect(normalizeCameraMotivation('action energy')).toBe('energy')
    expect(normalizeCameraMotivation('수인의 시선을 따라 요정을 드러낸다')).toBe('reveal')
    expect(normalizeCameraMotivation('긴장이 축적되는 느린 돌리 인')).toBe('emotion')
    expect(normalizeCameraMotivation('oner')).toBe('long_take')
    expect(normalizeCameraMotivation('because it looks nice')).toBeNull()
    expect(normalizeCameraMotivation(null)).toBeNull()
  })

  it('동기가 움직임의 꼴을 정한다 — 감정은 느린 dolly_in 으로, 에너지는 medium 이상으로, 리빌은 회전·후진·추적으로 접는다', () => {
    const emotion = coerceMotionForMotivation(normalizeCameraMotion({ type: 'tracking', speed: 'fast', magnitude: 'large' }).motion, 'emotion')
    expect(emotion.motion).toMatchObject({ type: 'dolly_in', speed: 'slow', magnitude: 'moderate' })
    expect(emotion.repairs.length).toBeGreaterThan(0)
    const energy = coerceMotionForMotivation(normalizeCameraMotion({ type: 'tracking', speed: 'slow', magnitude: 'minimal' }).motion, 'energy')
    expect(energy.motion).toMatchObject({ type: 'tracking', speed: 'medium', magnitude: 'moderate' })
    const reveal = coerceMotionForMotivation(normalizeCameraMotion({ type: 'dolly_in', speed: 'slow', magnitude: 'minimal' }).motion, 'reveal')
    expect(reveal.motion).toMatchObject({ type: 'pan', speed: 'slow', magnitude: 'moderate' })
    const pov = coerceMotionForMotivation(normalizeCameraMotion({ type: 'static', speed: 'slow', magnitude: 'minimal' }).motion, 'pov')
    expect(pov.motion.type).toBe('static')
    expect(pov.repairs).toEqual([])
  })

  it('"왜" 문장은 동기와 대상 이름으로 영어 한 구절이 된다', () => {
    expect(cameraWhyClause('reveal', 'Elf Chief')).toBe('to reveal Elf Chief, who is outside the frame at the start')
    expect(cameraWhyClause('emphasis', 'the water cup')).toBe('to emphasize the water cup — the audience must not miss it')
    expect(cameraWhyClause('emotion', 'Beast Chief')).toBe("to build the rising emotion on Beast Chief's face")
    expect(cameraWhyClause('energy', null)).toBe('to carry the kinetic energy of the action')
    expect(cameraWhyClause('pov', 'Beast Chief')).toBe("the camera is Beast Chief's point of view")
    expect(cameraWhyClause(null, 'x')).toBeNull()
  })
})

describe('동기 없는 무브는 코드가 정지로 접는다', () => {
  it('V4 가 움직임을 적었는데 동기가 없으면(데쿠파주에도 없으면) static 으로 접고 기록을 남긴다', () => {
    const r = enforceCameraMotivation({ type: 'pan', direction: 'right', speed: 'medium', magnitude: 'moderate' }, null)
    expect(r.camera_motion).toMatchObject({ type: 'static', direction: 'none' })
    expect(r.camera_motion.motivation).toBeUndefined()
    expect(r.repairs.join(' ')).toMatch(/동기 없음 → static/)
  })

  it('V4 에 동기가 없어도 데쿠파주의 camera_motivation·camera_target 을 이어받는다', () => {
    const r = enforceCameraMotivation(
      { type: 'pan', direction: 'right', speed: 'medium', magnitude: 'moderate' },
      { camera_intent: 'motivated_move', camera_motivation: 'reveal', camera_target: 'char_2' },
    )
    expect(r.camera_motion).toMatchObject({ type: 'pan', motivation: 'reveal', target: 'char_2' })
  })

  it('정지 카메라는 동기가 없어도 그대로이고, 동기가 있는 무브는 꼴을 교정해 motivation·target 을 싣는다', () => {
    const still = enforceCameraMotivation({ type: 'static', direction: 'none', speed: 'slow', magnitude: 'minimal' }, null)
    expect(still.camera_motion.type).toBe('static')
    expect(still.repairs).toEqual([])
    const moved = enforceCameraMotivation(
      { type: 'tracking', direction: 'forward', speed: 'fast', magnitude: 'large', motivation: 'emotion', target: 'char' },
      null,
    )
    expect(moved.camera_motion).toMatchObject({ type: 'dolly_in', speed: 'slow', motivation: 'emotion', target: 'char' })
  })

  it('데쿠파주의 motivated_move 는 여섯 중 하나로 접히고, 접히지 않으면 static 으로 내려간다', () => {
    expect(coerceDecoupageCamera({ camera_intent: 'motivated_move', camera_motivation: 'reveal', camera_target: 'char_2' })).toMatchObject({
      camera_intent: 'motivated_move', camera_motivation: 'reveal', camera_target: 'char_2', repair: null,
    })
    expect(coerceDecoupageCamera({ camera_intent: 'motivated_move', camera_move_motivation: '용족의 시선을 따라 요정을 드러낸다' })).toMatchObject({
      camera_intent: 'motivated_move', camera_motivation: 'reveal',
    })
    const down = coerceDecoupageCamera({ camera_intent: 'motivated_move', camera_move_motivation: 'feels cinematic' })
    expect(down.camera_intent).toBe('static')
    expect(down.camera_motivation).toBeNull()
    expect(down.repair).toMatch(/static/)
    expect(coerceDecoupageCamera({ camera_intent: 'static' })).toMatchObject({ camera_intent: 'static', camera_motivation: null, repair: null })
  })
})

describe('지시서가 닫힌 목록을 보여준다', () => {
  it('데쿠파주 지시서는 여섯 동기와 camera_motivation·camera_target 을 요구한다', () => {
    const text = buildSystemInstruction('ko')
    expect(text).toMatch(/camera_motivation/)
    expect(text).toMatch(/camera_target/)
    for (const m of CAMERA_MOTIVATIONS) expect(text).toContain(`"${m}"`)
    expect(text).toMatch(/여섯에 들지 않으면 움직이지 않는다/)
  })

  it('V4 지시서는 camera_motion.motivation·target, camera_setup.end.subject, camera_setup.pov_of 를 스키마에 싣는다', () => {
    const v4 = read('src/lib/writer/pipeline/stages/v4_shots.ts')
    expect(v4).toMatch(/"motivation": \$\{CAMERA_MOTIVATION_ENUM_TEXT\}/)
    expect(v4).toMatch(/"target": /)
    expect(v4).toMatch(/"subject": "reveal 대상 id/)
    expect(v4).toMatch(/"pov_of": null/)
    expect(v4).toMatch(/\$\{CAMERA_MOTIVATION_GUIDE\}/)
  })

  it('에너지 예외(결정 2번, 전후 비교 중)는 WRITER_ENERGY_EXCEPTION=1 일 때만 지시서에 실린다', () => {
    const v4 = read('src/lib/writer/pipeline/stages/v4_shots.ts')
    expect(v4).toMatch(/process\.env\.WRITER_ENERGY_EXCEPTION === '1'/)
    expect(v4).toMatch(/motivation=energy 인 액션 비트에서는 카메라 큰 무브와 인물 큰 액션을 함께 쓴다/)
  })
})
