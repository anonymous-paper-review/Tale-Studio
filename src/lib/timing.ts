/**
 * 서버 라우트/LLM 단계별 소요시간 로깅 (dev 터미널 출력).
 *
 * "어디서 오래 걸리는지" 관측 목적의 진단 로그.
 * 프로덕션에서는 LOG_TIMING=1 일 때만 출력.
 *
 * 사용 예:
 *   const t = startTimer('generate-scenes')
 *   await stepA(); t.mark('pumpup')
 *   await stepB(); t.mark('scene-architect')
 *   t.end()
 */

const enabled =
  process.env.NODE_ENV !== 'production' || process.env.LOG_TIMING === '1'

export function logTiming(scope: string, msg: string): void {
  if (!enabled) return
  console.info(`[timing] ${scope} · ${msg}`)
}

export interface Timer {
  /** 직전 mark(또는 시작) 이후 경과 + 누적 출력 */
  mark(step: string): void
  /** 총 소요시간 출력 */
  end(step?: string): void
}

export function startTimer(scope: string): Timer {
  const t0 = performance.now()
  let last = t0
  return {
    mark(step: string) {
      const now = performance.now()
      logTiming(
        scope,
        `${step}: +${(now - last).toFixed(0)}ms (total ${(now - t0).toFixed(0)}ms)`,
      )
      last = now
    },
    end(step = 'done') {
      const now = performance.now()
      logTiming(scope, `${step} — TOTAL ${(now - t0).toFixed(0)}ms`)
    },
  }
}
