'use client'

// project-share-demo-mode — 소유자 전용 UI 단일 게이트.
// 데모(공유) 세션에서 숨겨야 하는 컨트롤(프로젝트 스위처/새 프로젝트/로그아웃/공유버튼 등)을 감싼다.
// 새 소유자 전용 컨트롤은 이걸로 감싸기만 하면 데모 내성 유지(한 줄 opt-in).

import type { ReactNode } from 'react'
import { useIsDemo } from '@/hooks/use-is-demo'

export function OwnerOnly({ children }: { children: ReactNode }) {
  const isDemo = useIsDemo()
  if (isDemo) return null
  return <>{children}</>
}
