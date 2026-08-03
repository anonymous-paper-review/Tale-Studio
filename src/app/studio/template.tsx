'use client'

// 스테이지 전환 — 폴백 슬라이드 + VT 커밋 신호 (#tab-slide-v2 2026-08-03).
//
// 본 연출은 View Transitions(stage-transition.ts startStageViewTransition + globals.css
//   §stage-strip)가 담당한다: 옛 화면과 새 화면이 세로 스트립처럼 함께 밀린다. 이 template 은
//   두 가지 역할만 남는다:
//   1. VT 미지원 브라우저 폴백 — 라우트 전환마다 새로 마운트되는 성질을 이용해 새 화면만
//      아래(순방향)/위(역방향)에서 24px 슬라이드. VT 가 돌고 있으면 이중 연출이 되므로 생략.
//   2. resolveStageCommit — VT 콜백이 기다리는 "새 라우트 DOM 커밋" 신호. 여기 mount effect 가
//      정확히 그 시점이다.

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  resolveStageCommit,
  slideDirectionBetween,
  stageIndexFromPathname,
  stageNavMemory,
} from '@/lib/stage-transition'

export default function StudioTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const idx = stageIndexFromPathname(pathname)
  // 방향은 마운트 시 1회 고정. 싱글턴 읽기만 하고 갱신은 아래 effect 에서 — StrictMode 의
  //   이중 initializer 호출이 부작용 없이 같은 값을 계산한다.
  const [direction] = useState(() =>
    stageNavMemory.viaViewTransition
      ? 'none'
      : slideDirectionBetween(stageNavMemory.lastIndex, idx),
  )
  useEffect(() => {
    if (idx !== -1) stageNavMemory.lastIndex = idx
    resolveStageCommit()
  }, [idx])

  return (
    <div
      className={cn(
        // 레이아웃 체인 보존 — 페이지들은 flex column 부모의 flex-1 자식을 전제한다.
        'flex min-h-0 flex-1 flex-col',
        direction === 'forward' &&
          'animate-in fade-in-25 slide-in-from-bottom-6 duration-300 ease-out motion-reduce:animate-none',
        direction === 'back' &&
          'animate-in fade-in-25 slide-in-from-top-6 duration-300 ease-out motion-reduce:animate-none',
      )}
    >
      {children}
    </div>
  )
}
