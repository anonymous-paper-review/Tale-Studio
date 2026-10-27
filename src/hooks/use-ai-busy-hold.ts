'use client'

// 잠금 화면(AiBusyOverlay) 없이 도는 AI 작업도 일하는 동안 왼쪽 사이드바를 막는다(2026-10-27 오너 재확인 "AI 작업 중에도 사이드바가 눌림").
//   스타일 창 [만들기] · 순한 문장으로 다시 그리기 · 산문 쓰기 시작처럼 단추 안 도는 원만 보이는 작업은 창이 마우스는 막아도
//   Alt 단축키 · 아래 단추까지는 막지 못했다. active 인 동안 표를 올리고, 끝나거나 화면이 사라지면 내린다.
import { useEffect, useId } from 'react'
import { holdAiBusy } from '@/stores/ai-busy-store'

export function useAiBusyHold(active: boolean): void {
  const id = useId()
  useEffect(() => {
    if (!active) return
    return holdAiBusy(id)
  }, [active, id])
}
