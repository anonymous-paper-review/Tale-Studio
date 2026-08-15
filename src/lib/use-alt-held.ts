'use client'

// Alt(Option) 를 누르고 있는 동안 true (#keyboard-only 어포던스).
//   사이드바의 스테이지 배지(Alt+1~5)와 같은 문법 — 탭 안 뷰 전환(Alt+←/→) 힌트가 쓴다.
//   Alt+Tab 등으로 창을 떠나면 keyup 이 안 오므로 blur 에서 함께 내린다.

import { useEffect, useState } from 'react'

export function useAltHeld(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setHeld(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setHeld(false)
    }
    const clear = () => setHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return held
}
