// 장면의 움직임 요구와 실제 변화가 다르면 정확히 알려준다 (#adherence P2, 2026-08-07)
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
  it('행동과 인원, 중요한 대상을 넣으면 확인할 수 있는 장면 설명이 된다', () => {
    const c = buildStartClaim({ actionEn: 'A girl pulls a shard from the dune.', focalPoint: 'the shard', figureCount: 1 })
    expect(c).toContain('"A girl pulls a shard from the dune."')
    expect(c).toContain('1 figure present')
    expect(c).toContain('emphasis on: the shard')
  })

  it('등장인물이 없으면 인물 없음으로 분명히 적는다', () => {
    expect(buildStartClaim({ actionEn: 'Empty ruins at dawn.', figureCount: 0 })).toContain('no figures')
  })
})

describe('motionExpectation', () => {
  it('카메라가 멈춘 장면은 멈춤으로, 이동하는 장면은 이동으로 구분한다', () => {
    expect(motionExpectation(dyn())!.cameraStatic).toBe(true)
    expect(motionExpectation(dyn({ camera_motion: { type: 'handheld_drift', speed: 'slow', magnitude: 'minimal' } }))!.cameraStatic).toBe(true)
    expect(motionExpectation(dyn({ camera_motion: { type: 'tracking', direction: 'forward', speed: 'slow', magnitude: 'moderate' } }))!.cameraStatic).toBe(false)
  })

  it('카메라나 인물의 큰 움직임이 있으면 큰 움직임으로 표시한다', () => {
    expect(motionExpectation(dyn({ character_motion: [{ character_id: 'c', verb: 'leaps', magnitude: 'large' }] }))!.hasLargeMotion).toBe(true)
    expect(motionExpectation(dyn({ camera_motion: { type: 'dolly_in', speed: 'fast', magnitude: 'large' } }))!.hasLargeMotion).toBe(true)
    expect(motionExpectation(dyn())!.hasLargeMotion).toBe(false)
  })

  it('방향을 정한 이동만 방향 있는 움직임으로 표시하고 멈춤과 무방향은 제외한다', () => {
    expect(motionExpectation(dyn())!.directional).toBeNull()
    const d = motionExpectation(dyn({ camera_motion: { type: 'pan', direction: 'left_to_right', speed: 'slow', magnitude: 'moderate' } }))!
    expect(d.directional).toEqual({ type: 'pan', direction: 'left_to_right' })
  })

  it('움직임 정보가 없으면 판정하지 않고 건너뛴다', () => {
    expect(motionExpectation(null)).toBeNull()
  })
})

describe('judgeMotionByDiff', () => {
  const staticExp = { cameraStatic: true, hasLargeMotion: false, directional: null }
  const largeExp = { cameraStatic: false, hasLargeMotion: true, directional: null }

  it('멈춤을 요구했는데 큰 변화가 생기면 과한 움직임으로 판정한다 (멈춤인데 움직이는 증상)', () => {
    expect(judgeMotionByDiff(MOTION_DIFF.staticMax + 5, staticExp).status).toBe('over_motion')
    expect(judgeMotionByDiff(MOTION_DIFF.staticMax - 1, staticExp).status).toBe('ok')
  })

  it('큰 움직임을 요구했는데 변화가 작으면 움직임 부족으로 판정한다 (시간 대비 변화 없음)', () => {
    expect(judgeMotionByDiff(MOTION_DIFF.largeMin - 2, largeExp).status).toBe('under_motion')
    expect(judgeMotionByDiff(MOTION_DIFF.largeMin + 10, largeExp).status).toBe('ok')
  })

  it('멈춤 장면의 작은 변화는 허용해 화면이 얼어붙지 않게 한다', () => {
    expect(judgeMotionByDiff(4, staticExp).status).toBe('ok')
  })
})

describe('directionExpectationText', () => {
  it('왼쪽에서 오른쪽으로 움직인다고 하면 화면 기준 방향을 분명히 적는다', () => {
    const t = directionExpectationText({ type: 'pan', direction: 'left_to_right' })
    expect(t).toContain('screen right')
    expect(t).toContain('flows left')
  })
})
