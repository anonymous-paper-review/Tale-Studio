'use client'

import { useEffect, useState } from 'react'

// Cmd(⌘)/Ctrl 키를 누르고 있는 동안 true. 멘션 가능한 카드의 "클릭하면 멘션" 어포던스 표시용.
// 창 blur / 키 떼면 해제. (모디파이어+클릭 제스처의 발견 가능성을 높이는 시각 힌트)
export function useModifierHeld(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setHeld(e.metaKey || e.ctrlKey)
    const onBlur = () => setHeld(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  return held
}
