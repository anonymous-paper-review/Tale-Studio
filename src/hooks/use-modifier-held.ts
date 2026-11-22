'use client'

import { useEffect, useState } from 'react'

// Cmd(⌘)/Ctrl 키를 누르고 있는 동안 true. 멘션 가능한 카드의 "클릭하면 멘션" 어포던스 표시용.
// 창 blur / 키 떼면 해제. (모디파이어+클릭 제스처의 발견 가능성을 높이는 시각 힌트)
// 이벤트를 받을 수 없는 곳(서버 그리기 · 창 흉내가 덜 된 시험 화면)에서는 듣개를 붙이지 않고 꺼진 채로 둔다 —
//   표시 하나 때문에 화면이 깨지지 않게(리드 2026-11-22, D9 콘티에도 같은 표시). 약속: tests/writer/mention-armed.test.ts

type KeyTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>

/** 대상(보통 window)에 ⌘/Ctrl 누름 · 뗌 · 창 떠남을 듣는다 — 돌려준 함수로 뗀다. 들을 수 없는 대상이면 아무것도 하지 않는다. */
export function subscribeModifierHeld(target: Partial<KeyTarget> | null | undefined, onHeld: (held: boolean) => void): () => void {
  if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') return () => {}
  const listen = target as KeyTarget
  const onKey = (e: Event) => onHeld((e as KeyboardEvent).metaKey || (e as KeyboardEvent).ctrlKey)
  const onBlur = () => onHeld(false)
  listen.addEventListener('keydown', onKey)
  listen.addEventListener('keyup', onKey)
  listen.addEventListener('blur', onBlur)
  return () => {
    listen.removeEventListener('keydown', onKey)
    listen.removeEventListener('keyup', onKey)
    listen.removeEventListener('blur', onBlur)
  }
}

export function useModifierHeld(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => subscribeModifierHeld(typeof window === 'undefined' ? undefined : window, setHeld), [])
  return held
}
