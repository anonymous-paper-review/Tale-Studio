'use client'

// project-share-demo-mode — 공유 링크 진입점.
//   토큰을 메모리 시드 + (가능하면) demo_share 쿠키 세팅 + 스냅샷 로드 → /studio 로 데모 진입.
//   스튜디오 경로에 ?share=<토큰> 을 실어 보내므로 쿠키가 차단된 브라우저에서도 열린다(URL 티켓).
//   전체 새로고침 시엔 studio 부팅이 토큰(쿠키 또는 URL)으로 스냅샷을 재fetch 한다.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DEMO_SHARE_COOKIE, setDemoSnapshot, setDemoToken } from '@/lib/demo/context'
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
        // 쿠키는 보조 수단(best-effort) — 차단돼도 URL 티켓 + 메모리 시드로 데모가 성립한다.
        document.cookie = `${DEMO_SHARE_COOKIE}=${encodeURIComponent(token)}; path=/; samesite=lax`
        setDemoToken(token)
        const res = await fetch(`/api/share/${token}`)
        if (!res.ok) {
          if (!cancelled) setError('링크가 만료되었거나 유효하지 않아요.')
          return
        }
        const snapshot = (await res.json()) as ProjectSnapshot
        if (cancelled) return
        setDemoSnapshot(snapshot)
        const pid = snapshot?.projectId
        const ticket = `share=${encodeURIComponent(token)}`
        router.replace(
          pid
            ? `/studio/producer?projectId=${encodeURIComponent(pid)}&${ticket}`
            : `/studio/producer?${ticket}`,
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
