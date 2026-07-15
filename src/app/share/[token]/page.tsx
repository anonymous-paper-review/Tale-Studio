'use client'

// project-share-demo-mode — 공유 링크 진입점.
//   토큰으로 demo_share 쿠키 세팅 + 스냅샷 로드 → /studio 로 데모 진입(클라 네비게이션).
//   전체 새로고침 시엔 studio 부팅이 쿠키 토큰으로 스냅샷을 재fetch 한다(통합 단계).

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DEMO_SHARE_COOKIE, setDemoSnapshot } from '@/lib/demo/context'
import type { ProjectSnapshot } from '@/lib/demo/types'

export default function SharePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = params.token
    if (!token) return
    let cancelled = false

    void (async () => {
      try {
        document.cookie = `${DEMO_SHARE_COOKIE}=${encodeURIComponent(token)}; path=/; samesite=lax`
        // 쿠키 차단 방어: demo_share 가 실제로 안 박히면 /studio 진입이 미들웨어에서
        //   /login 으로 튕긴다(시크릿창 "모든 쿠키 차단" 등에서 실제 발생 — 2026-07-15 재현).
        //   조용히 로그인 페이지로 떨어뜨리는 대신 원인을 알려주고 멈춘다.
        if (!document.cookie.includes(`${DEMO_SHARE_COOKIE}=`)) {
          if (!cancelled)
            setError(
              '브라우저가 쿠키를 차단하고 있어 미리보기를 열 수 없어요. 이 사이트의 쿠키를 허용한 뒤 다시 열어주세요.',
            )
          return
        }
        const res = await fetch(`/api/share/${token}`)
        if (!res.ok) {
          if (!cancelled) setError('링크가 만료되었거나 유효하지 않아요.')
          return
        }
        const snapshot = (await res.json()) as ProjectSnapshot
        if (cancelled) return
        setDemoSnapshot(snapshot)
        const pid = snapshot?.projectId
        router.replace(
          pid
            ? `/studio/producer?projectId=${encodeURIComponent(pid)}`
            : '/studio/producer',
        )
      } catch {
        if (!cancelled) setError('미리보기를 불러오지 못했어요.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params.token, router])

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {error ?? '미리보기 준비 중…'}
    </div>
  )
}
