'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const IDLE_TIMEOUT = 30 * 60 * 1000 // 30 minutes
const WARNING_BEFORE = 5 * 60 * 1000 // warn 5 min before

// 유휴 자동 로그아웃 예외 계정 — 관리자 편의(2026-07-09, 사용자 요청). role 인프라가 없어 이메일 화이트리스트로.
//   클라 UX 예외일 뿐 — 세션 자체는 Supabase JWT 만료/갱신이 관장한다. 이메일은 소문자 비교, 추가 admin 은 여기에.
//   트레이드오프: 예외 계정은 자리 비운 세션이 유휴로 안 끊김(관리자 본인 요청이라 수용).
const IDLE_LOGOUT_EXEMPT_EMAILS = new Set(['admin@tale.studio'])

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
        toast.warning('세션이 곧 만료됩니다', {
          description: '5분 내 활동이 없으면 자동 로그아웃됩니다.',
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
      const email = data.user?.email?.toLowerCase() ?? ''
      if (IDLE_LOGOUT_EXEMPT_EMAILS.has(email)) return
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
