// 생성물 정합 검사 코어(#adherence P2, 2026-08-07) 회귀 — 순수 판정만(IO 없음).
import { describe, it, expect } from 'vitest'
import {
  buildStartClaim,
  directionExpectationText,
  judgeMotionByDiff,
  motionExpectation,
  MOTION_DIFF,
} from '@/lib/adherence/core'
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

describe('buildStartClaim', () => {
  it('액션·인원·초점을 판정 가능한 claim 으로 조립한다', () => {
    const c = buildStartClaim({ actionEn: 'A girl pulls a shard from the dune.', focalPoint: 'the shard', figureCount: 1 })
    expect(c).toContain('"A girl pulls a shard from the dune."')
    expect(c).toContain('1 figure present')
    expect(c).toContain('emphasis on: the shard')
  })

  it('무인물은 empty scene 으로 명시(인물 유무가 흔한 불일치 축)', () => {
    expect(buildStartClaim({ actionEn: 'Empty ruins at dawn.', figureCount: 0 })).toContain('no figures')
  })
})

describe('motionExpectation', () => {
  it('static/handheld_drift/rack_focus 는 카메라 정지 취급', () => {
    expect(motionExpectation(dyn())!.cameraStatic).toBe(true)
    expect(motionExpectation(dyn({ camera_motion: { type: 'handheld_drift', speed: 'slow', magnitude: 'minimal' } }))!.cameraStatic).toBe(true)
    expect(motionExpectation(dyn({ camera_motion: { type: 'tracking', direction: 'forward', speed: 'slow', magnitude: 'moderate' } }))!.cameraStatic).toBe(false)
  })

  it('large 는 카메라 magnitude 또는 인물 large 어느 쪽이든 잡는다', () => {
    expect(motionExpectation(dyn({ character_motion: [{ character_id: 'c', verb: 'leaps', magnitude: 'large' }] }))!.hasLargeMotion).toBe(true)
    expect(motionExpectation(dyn({ camera_motion: { type: 'dolly_in', speed: 'fast', magnitude: 'large' } }))!.hasLargeMotion).toBe(true)
    expect(motionExpectation(dyn())!.hasLargeMotion).toBe(false)
  })

  it('방향성 이동만 directional 로 표시(정지·무방향 제외)', () => {
    expect(motionExpectation(dyn())!.directional).toBeNull()
    const d = motionExpectation(dyn({ camera_motion: { type: 'pan', direction: 'left_to_right', speed: 'slow', magnitude: 'moderate' } }))!
    expect(d.directional).toEqual({ type: 'pan', direction: 'left_to_right' })
  })

  it('dyn 없음 → null (검사 불가 — skipped 경로)', () => {
    expect(motionExpectation(null)).toBeNull()
  })
})

describe('judgeMotionByDiff', () => {
  const staticExp = { cameraStatic: true, hasLargeMotion: false, directional: null }
  const largeExp = { cameraStatic: false, hasLargeMotion: true, directional: null }

  it('정지 계약 + 큰 diff = over_motion (증상: static 인데 움직임)', () => {
    expect(judgeMotionByDiff(MOTION_DIFF.staticMax + 5, staticExp).status).toBe('over_motion')
    expect(judgeMotionByDiff(MOTION_DIFF.staticMax - 1, staticExp).status).toBe('ok')
  })

  it('large 설계 + 작은 diff = under_motion (증상: 시간 대비 변화 없음)', () => {
    expect(judgeMotionByDiff(MOTION_DIFF.largeMin - 2, largeExp).status).toBe('under_motion')
    expect(judgeMotionByDiff(MOTION_DIFF.largeMin + 10, largeExp).status).toBe('ok')
  })

  it('정지 + 미세 diff(생명감) = ok — 얼어붙음을 강요하지 않는다', () => {
    expect(judgeMotionByDiff(4, staticExp).status).toBe('ok')
  })
})

describe('directionExpectationText', () => {
  it('화면 기준 양방향 서술(중의성 제거)', () => {
    const t = directionExpectationText({ type: 'pan', direction: 'left_to_right' })
    expect(t).toContain('screen right')
    expect(t).toContain('flows left')
  })
})
