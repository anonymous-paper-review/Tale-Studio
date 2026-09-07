// Ctrl+휠 축척 스텝퍼(#a1 2026-07-15) — burst(연속 이벤트 묶음) = 1단계 계약 검증.
//   시계를 주입해 OS/드라이버별 이벤트 패턴(단발 노치·스무스 스크롤 분할·프리스핀 연속)을 재현한다.
import { describe, expect, it, vi } from 'vitest'
import { createWheelNotchStepper } from '@/lib/wheel-notch'

function makeStepper() {
  let t = 0
  const onStep = vi.fn()
  const feed = createWheelNotchStepper(onStep, () => t)
  return {
    onStep,
    at: (ms: number, deltaY: number) => {
      t = ms
      feed({ deltaY })
    },
  }
}

describe('createWheelNotchStepper', () => {
  it('단발 노치(이벤트 1개) = 1단계, 방향은 deltaY 부호', () => {
    const s = makeStepper()
    s.at(0, -100)
    expect(s.onStep).toHaveBeenCalledTimes(1)
    expect(s.onStep).toHaveBeenLastCalledWith(1) // 위로 = 확대
    s.at(1000, 300)
    expect(s.onStep).toHaveBeenCalledTimes(2)
    expect(s.onStep).toHaveBeenLastCalledWith(-1)
  })

  it('스무스 스크롤이 노치 1칸을 여러 이벤트로 쪼개 보내도(간격<GAP) 1단계만', () => {
    const s = makeStepper()
    // 로지텍류: ~30ms 간격 소델타 스트림 300ms — 옛 140ms 쿨다운으로는 3단계 튀던 패턴
    for (let t = 0; t <= 300; t += 30) s.at(t, -20)
    expect(s.onStep).toHaveBeenCalledTimes(1)
  })

  it('의도적으로 띄엄띄엄 굴리면(간격>GAP) 굴림마다 1단계', () => {
    const s = makeStepper()
    s.at(0, -100)
    s.at(200, -100)
    s.at(400, -100)
    expect(s.onStep).toHaveBeenCalledTimes(3)
  })

  it('길게 이어지는 burst(프리스핀)는 REPEAT 간격마다만 추가 단계', () => {
    const s = makeStepper()
    for (let t = 0; t <= 1000; t += 50) s.at(t, -30) // 1초 연속 스트림
    // 0ms에 1단계 + 420ms/840ms 부근 반복 2단계 = 총 3
    expect(s.onStep).toHaveBeenCalledTimes(3)
  })

  it('deltaY=0 이벤트는 무시한다', () => {
    const s = makeStepper()
    s.at(0, 0)
    expect(s.onStep).not.toHaveBeenCalled()
  })
})
