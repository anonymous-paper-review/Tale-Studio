'use client'

// Take 잔액 + 과금 모드 클라 훅 (#payments-phase-2 v4 #2 "생성 전 N Take 소모 표시").
//
// 모듈 스코프 단일 캐시 — Director 캔버스에 노드가 수십 개라 노드마다 fetch 하면 안 된다.
//   최초 마운트에서 한 번 가져오고, 이후 마운트되는 훅은 캐시를 그대로 구독한다(리스너 팬아웃).
//   생성 성공/실패로 잔액이 바뀌어도 이 배지는 근사치 표시 목적이라(실제 차단은 서버 402) 폴링·
//   웹소켓 없이 refetchTakeBalance() 수동 트리거만 제공 — 필요해지면 호출부가 붙인다.
import { useEffect, useState } from 'react'
import type { TakeBillingMode } from '@/lib/billing/take-hold'

export interface TakeBalanceState {
  /** null = admin(무제한) 또는 아직 로딩 전. */
  balance: number | null
  mode: TakeBillingMode
  loading: boolean
}

const INITIAL_STATE: TakeBalanceState = { balance: null, mode: 'off', loading: true }

let cache: TakeBalanceState = INITIAL_STATE
let inflight: Promise<void> | null = null
const listeners = new Set<(state: TakeBalanceState) => void>()

function notify(): void {
  for (const listener of listeners) listener(cache)
}

async function fetchOnce(): Promise<void> {
  try {
    const res = await fetch('/api/billing/take-balance')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { balance: number | null; mode: TakeBillingMode }
    cache = { balance: body.balance, mode: body.mode, loading: false }
  } catch {
    // 조회 실패는 배지를 숨기는 쪽(mode 'off' 취급)이 안전 — 표시 실패가 생성 자체를 막지 않는다.
    cache = { balance: null, mode: 'off', loading: false }
  }
  notify()
}

/** 잔액을 강제로 다시 읽는다 — hold/release 직후 정확한 값이 필요한 호출부용. */
export function refetchTakeBalance(): void {
  inflight = fetchOnce()
}

export function useTakeBalance(): TakeBalanceState {
  const [state, setState] = useState(cache)
  useEffect(() => {
    listeners.add(setState)
    if (!inflight) inflight = fetchOnce()
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return state
}
