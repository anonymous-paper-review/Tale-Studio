'use client'

// 랜딩 우측 "-" 목차 (#landing-v2c 2026-08-03) — 스냅 스크롤을 걷어낸 대신(뚝뚝 끊겨
//   "잘 안 넘어간다"는 피드백) 연속 스크롤 + 대시 내비로 섹션 점프를 제공한다.
//   대시 hover 시 제목이 왼쪽으로 떠오르고, 현재 보고 있는 섹션의 대시가 길고 밝아진다
//   (IntersectionObserver — 뷰포트 중앙 밴드에 걸린 섹션이 활성).

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export interface SectionNavItem {
  id: string
  label: string
}

export function SectionNav({ sections }: { sections: readonly SectionNavItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null)

  useEffect(() => {
    // 뷰포트 세로 중앙 ±20% 밴드에 들어온 섹션을 활성으로 — 풀스크린 섹션 전제라 항상 1개만 걸린다.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id)
        }
      },
      { rootMargin: '-40% 0px -40% 0px' },
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  const jump = (id: string) => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    // 기본은 촘촘하고 작게(시야 방해 최소), 내비 영역에 마우스가 오면 간격·대시가 함께 커진다
    //   (#landing-v2d 2026-08-03 — dock 스타일). 개별 대시 hover 는 밝기 + 제목 pill 담당.
    <nav
      aria-label="섹션 목차"
      className="group/nav fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-1.5 transition-[gap] duration-300 hover:gap-4 md:flex"
    >
      {sections.map((s) => {
        const active = s.id === activeId
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            aria-label={`${s.label} 섹션으로 이동`}
            aria-current={active ? 'true' : undefined}
            className="group flex items-center gap-3 py-1"
          >
            <span className="pointer-events-none translate-x-1 whitespace-nowrap rounded-full border border-white/15 bg-black/80 px-2.5 py-1 text-xs font-medium text-gray-200 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
              {s.label}
            </span>
            <span
              className={cn(
                'h-0.5 rounded-full transition-all duration-300',
                active
                  ? 'w-5 bg-white group-hover/nav:w-8'
                  : 'w-3 bg-white/30 group-hover/nav:w-6 group-hover:bg-white/70',
              )}
            />
          </button>
        )
      })}
    </nav>
  )
}
