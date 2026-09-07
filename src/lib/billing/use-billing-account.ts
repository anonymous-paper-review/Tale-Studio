'use client'

// 계정·결제 요약 클라 훅 (#payments-phase-3 P9a) — /api/billing/account 를 읽는다.
//   use-take-balance 와 같은 모듈 캐시 패턴: 페이지와 사이드바 배지가 같은 응답을 나눠 쓴다.
//   사이드바 배지는 호버할 때만 읽고(lazy), 페이지는 마운트에서 읽는다. 잔액이 바뀌는 지점은
//   refetchBillingAccount() 로 갱신한다(생성 성공/실패 뒤 refetchTakeBalance 와 나란히).
import { useEffect, useState } from 'react'
import type { BillingAccountResponse } from '@/app/api/billing/account/route'

export interface BillingAccountState {
  data: BillingAccountResponse | null
  loading: boolean
  error: string | null
}

const INITIAL: BillingAccountState = { data: null, loading: false, error: null }

let cache: BillingAccountState = INITIAL
let inflight: Promise<void> | null = null
const listeners = new Set<(state: BillingAccountState) => void>()

function notify(): void {
  for (const listener of listeners) listener(cache)
}

async function fetchOnce(): Promise<void> {
  cache = { ...cache, loading: true }
  notify()
  try {
    const res = await fetch('/api/billing/account')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as BillingAccountResponse
    cache = { data, loading: false, error: null }
  } catch (err) {
    cache = { data: cache.data, loading: false, error: err instanceof Error ? err.message : 'failed' }
  } finally {
    inflight = null
  }
  notify()
}

export function refetchBillingAccount(): Promise<void> {
  if (!inflight) inflight = fetchOnce()
  return inflight
}

/**
 * @param eager true 면 마운트에서 바로 읽는다(페이지). false 면 캐시만 구독한다(배지 — 호버 때 refetch 호출).
 */
export function useBillingAccount(eager = true): BillingAccountState {
  const [state, setState] = useState(cache)
  useEffect(() => {
    listeners.add(setState)
    if (eager && !cache.data && !inflight) inflight = fetchOnce()
    return () => {
      listeners.delete(setState)
    }
  }, [eager])
  return state
}
