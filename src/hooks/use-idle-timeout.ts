'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { idleLogoutExempt } from '@/lib/idle-logout'

const IDLE_TIMEOUT = 30 * 60 * 1000 // 30 minutes
const WARNING_BEFORE = 5 * 60 * 1000 // warn 5 min before

// 유휴 자동 로그아웃 예외 계정 — 관리자(2026-07-09) · 시연 계정(2026-10-27 오너). 목록은 src/lib/idle-logout.ts 한 곳.

export function useIdleTimeout() {
  const router = useRouter()
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warned = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    let disposed = false
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'] as const

    function resetTimers() {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (warnTimer.current) clearTimeout(warnTimer.current)
      warned.current = false

      warnTimer.current = setTimeout(() => {
        warned.current = true
        const locale = useLocaleStore.getState().locale
        toast.warning(translate(locale, 'Your session is about to expire'), {
          description: translate(locale, "You'll be automatically logged out after 5 minutes of inactivity."),
          duration: 10_000,
        })
      }, IDLE_TIMEOUT - WARNING_BEFORE)

      idleTimer.current = setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/login')
      }, IDLE_TIMEOUT)
    }

    // 현재 로그인 계정이 예외 목록이면 유휴 타이머·리스너를 아예 가동하지 않는다(= 자동 로그아웃 없음).
    void supabase.auth.getUser().then(({ data }) => {
      if (disposed) return
      if (idleLogoutExempt(data.user?.email)) return
      events.forEach((e) => window.addEventListener(e, resetTimers, { passive: true }))
      resetTimers()
    })

    return () => {
      disposed = true
      events.forEach((e) => window.removeEventListener(e, resetTimers))
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (warnTimer.current) clearTimeout(warnTimer.current)
    }
  }, [router])
}
