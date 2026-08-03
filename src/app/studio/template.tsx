'use client'

// 스테이지 전환 슬라이드 (#tab-slide 2026-08-03).
//
// App Router 의 template 은 라우트 전환마다 새 인스턴스로 마운트된다 — 그 마운트 애니메이션이
//   곧 전환 연출이다. 이전 stage 와 새 stage 의 파이프라인 순서를 비교해 순방향이면 오른쪽,
//   역방향이면 왼쪽에서 들어온다. 초기 진입(이전 없음)·비스테이지 경로는 연출 없음.
// 옛 화면을 함께 밀어내는 양방향 슬라이드는 View Transitions(실험 플래그) 없이는 불가능해
//   의도적으로 새 화면 진입만 연출한다 — 300ms, 24px. reduced-motion 이면 생략.

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  slideDirectionBetween,
  stageIndexFromPathname,
  stageNavMemory,
} from '@/lib/stage-transition'

export default function StudioTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const idx = stageIndexFromPathname(pathname)
  // 방향은 마운트 시 1회 고정. 싱글턴 읽기만 하고 갱신은 아래 effect 에서 — StrictMode 의
  //   이중 initializer 호출이 부작용 없이 같은 값을 계산한다.
  const [direction] = useState(() => slideDirectionBetween(stageNavMemory.lastIndex, idx))
  useEffect(() => {
    if (idx !== -1) stageNavMemory.lastIndex = idx
  }, [idx])

  return (
    <div
      className={cn(
        // 레이아웃 체인 보존 — 페이지들은 flex column 부모의 flex-1 자식을 전제한다.
        'flex min-h-0 flex-1 flex-col',
        direction === 'forward' &&
          'animate-in fade-in-25 slide-in-from-right-6 duration-300 ease-out motion-reduce:animate-none',
        direction === 'back' &&
          'animate-in fade-in-25 slide-in-from-left-6 duration-300 ease-out motion-reduce:animate-none',
      )}
    >
      {children}
    </div>
  )
}
