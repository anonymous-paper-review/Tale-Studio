'use client'

// 좁은 화면인가 — 1100px 보다 좁으면 Director · Editor 에서 연 Lumi 채팅이 화면을 밀지 않고 위에 덮인다(오너 11/14 "추천대로").
//   브라우저 창 폭이 바뀌면 다시 본다. 서버 그리기 · 창이 없는 곳에서는 넓은 화면으로 본다. 약속: tests/director/chat-closed.test.ts
import { useSyncExternalStore } from 'react'

const NARROW_QUERY = '(max-width: 1099px)'

function narrowNow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const list = window.matchMedia(NARROW_QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, narrowNow, () => false)
}
