'use client'

import { useEffect, useRef } from 'react'

/**
 * fn 을 한 번 끝낸 뒤 intervalMs 뒤에 다음을 예약한다(setTimeout 순차). 첫 호출은 intervalMs 뒤.
 * 돌려주는 함수를 부르면 예약을 풀고, 진행 중이던 호출이 끝나도 다음을 예약하지 않는다.
 */
export function startSequentialPoll(fn: () => Promise<unknown> | void, intervalMs: number): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    timer = setTimeout(async () => {
      try {
        await fn()
      } catch {
        // 한 번의 실패가 폴링을 멈추지 않는다.
      }
      if (!cancelled) schedule()
    }, intervalMs)
  }
  schedule()
  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}

/** enabled 동안 setInterval 대신 앞 읽기가 끝난 뒤에만 다음 읽기를 예약한다. 비활성/unmount 시 예약을 푼다. */
export function useSequentialPoll(fn: () => Promise<unknown> | void, intervalMs: number, enabled: boolean): void {
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(() => {
    if (!enabled) return
    return startSequentialPoll(() => fnRef.current(), intervalMs)
  }, [intervalMs, enabled])
}
