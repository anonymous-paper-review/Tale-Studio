'use client'

// Alt(Option) + ←/→ 로 스테이지 안 뷰를 넘기는 공용 훅 (#keyboard-only 2026-08-11).
//
// Alt+QWERT(스테이지 간)와 짝을 이루는 스테이지 **안** 이동이다:
//   writer  러프 스토리보드 ↔ 트리트먼트 ↔ 대사
//   artist  인물 ↔ 배경
//   director Node ↔ Storyboard(Previz) ↔ Storyboard(Real)
//
// 판정 규칙은 stage-shortcuts 와 동일 철학:
// - Alt 단독일 때만 (Ctrl/Cmd/Shift 조합은 브라우저·선택 조작의 몫).
// - e.code 로 판정 — macOS Option+화살표는 key 가 그대로지만 일관성을 위해 code 사용.
// - 입력창 포커스 여부와 무관하게 가로챈다. Option+←(단어 점프)를 잃지만, 채팅 입력이
//   상시 포커스인 앱에서 편집 제스처에 양보하면 이 단축키는 죽은 기능이 된다(Alt+QWERT 와
//   같은 결정). preventDefault 로 Alt+← 의 브라우저 히스토리 이동(Windows/Linux)도 막는다.
// - 순환: 마지막에서 → 는 처음으로.

import { useEffect } from 'react'

export function useAltArrowCycle<T extends string>(
  views: readonly T[],
  current: T,
  onChange: (next: T) => void,
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return
      if (views.length < 2) return
      e.preventDefault()
      e.stopPropagation()
      const dir = e.code === 'ArrowRight' ? 1 : -1
      const idx = views.indexOf(current)
      const next = views[(Math.max(idx, 0) + dir + views.length) % views.length]
      if (next !== current) onChange(next)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [views, current, onChange])
}
