'use client'

// Take 를 쓰는 단추를 누를 때 잔액을 다시 읽는다(리드 2026-11-14, 검토 b) — 못 읽으면 시작하지 않고 까닭을 보인다.
//   잔액 훅은 못 읽음을 "과금 꺼짐"과 같은 값(mode 'off')으로 주어, 그대로 쓰면 확인 창에 Take 줄 없이 전부 시작했다.
//   까닭 글은 Editor 넘기기 창(D8)과 같은 말이다. 약속: tests/director/takes-unknown.test.ts
import { fetchTakeBalance } from '@/lib/billing/use-take-balance'

export const TAKES_UNKNOWN_TEXT = "I couldn't check your Takes, so I didn't start. Please try again in a moment."

/** 잔액을 새로 읽어 읽혔는가 — 못 읽었으면 Take 를 쓰는 일을 시작하지 않는다. */
export async function takesReadable(): Promise<boolean> {
  return !(await fetchTakeBalance()).failed
}
