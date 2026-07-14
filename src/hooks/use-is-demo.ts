'use client'

// project-share-demo-mode — 데모 세션 여부 훅. 부팅 후 불변이라 구독 불필요.
import { useSyncExternalStore } from 'react'
import { isDemoSession } from '@/lib/demo/context'

const noopSubscribe = () => () => {}

export function useIsDemo(): boolean {
  return useSyncExternalStore(noopSubscribe, isDemoSession, () => false)
}
