'use client'

// Alt(Option) 홀드 시 "이 뷰 묶음은 Alt+←/→ 로 넘긴다"를 알리는 힌트 배지 (#keyboard-only
//   어포던스 2026-08-12). 뷰 토글(TabsList 등) 좌우에 화살표 키 칩을 띄운다 — 사이드바의
//   Alt+숫자 배지와 같은 등장 문법(홀드 중에만, 놓으면 사라짐).
//
// 사용: 토글을 <AltArrowHint> 로 감싼다. 레이아웃에 끼어들지 않게 칩은 absolute.

import type { ReactNode } from 'react'
import { useAltHeld } from '@/lib/use-alt-held'

export function AltArrowHint({ children }: { children: ReactNode }) {
  const held = useAltHeld()
  return (
    <span className="relative inline-flex items-center">
      {held && (
        <kbd
          aria-hidden
          className="absolute -left-6 top-1/2 -translate-y-1/2 rounded border border-border bg-card px-1 font-mono text-[10px] font-semibold leading-[1.4] text-foreground shadow-sm"
        >
          ←
        </kbd>
      )}
      {children}
      {held && (
        <kbd
          aria-hidden
          className="absolute -right-6 top-1/2 -translate-y-1/2 rounded border border-border bg-card px-1 font-mono text-[10px] font-semibold leading-[1.4] text-foreground shadow-sm"
        >
          →
        </kbd>
      )}
    </span>
  )
}
