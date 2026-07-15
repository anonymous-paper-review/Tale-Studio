// Ctrl+휠 축척 공용 스텝퍼(#a1 2026-07-15) — 목표: 휠 한 번 굴림(제스처) = 축척 1단계.
//   브라우저엔 OS "한 번에 스크롤할 줄 수" 설정을 읽는 API가 없다(deltaY에 이미 곱해져 옴).
//   게다가 스무스 스크롤 드라이버(로지텍 등)·트랙패드·프리스핀 휠은 노치 1칸을 수십 ms 간격의
//   이벤트 여러 개로 쪼개 보내서, 고정 쿨다운(이벤트당 1단계)으로는 한 번에 2단계 이상 튄다.
//   → 우회: 이벤트 간격이 GAP_MS 미만으로 이어지는 묶음(burst)을 "1회 굴림"으로 정규화한다.
//   길게 이어지는 burst(프리스핀/트랙패드 핀치 유지)는 REPEAT_MS마다 1단계씩만 추가 허용.
const GAP_MS = 140
const REPEAT_MS = 420

/**
 * 휠 이벤트를 먹여주면 "이 이벤트에서 1단계 이동해야 하는가"를 판정해 onStep을 호출한다.
 * dir: 휠 위(deltaY<0) = +1(확대), 아래 = -1(축소). ctrl 판정/preventDefault는 호출부 책임.
 */
export function createWheelNotchStepper(
  onStep: (dir: 1 | -1) => void,
  now: () => number = () => performance.now(),
) {
  let lastEventAt = Number.NEGATIVE_INFINITY
  let lastStepAt = Number.NEGATIVE_INFINITY
  return (e: { deltaY: number }) => {
    if (e.deltaY === 0) return
    const t = now()
    const isNewBurst = t - lastEventAt > GAP_MS
    lastEventAt = t
    if (!isNewBurst && t - lastStepAt < REPEAT_MS) return
    lastStepAt = t
    onStep(e.deltaY < 0 ? 1 : -1)
  }
}
