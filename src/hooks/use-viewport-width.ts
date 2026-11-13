'use client'

// 브라우저 창 폭(px) — 창 크기가 바뀌면 다시 본다. 서버 그리기 · 창이 없는 곳에서는 0.
//   Editor 가 연 Lumi 채팅을 밀지 덮을지 고를 때 쓴다(src/lib/editor/workspace-fit.ts).
import { useSyncExternalStore } from 'react'

function widthNow(): number {
  return typeof window !== 'undefined' && typeof window.innerWidth === 'number' ? window.innerWidth : 0
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, widthNow, () => 0)
}
