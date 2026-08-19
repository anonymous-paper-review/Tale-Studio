'use client'

// project-share-demo-mode — 공유 링크 진입점.
//   토큰을 메모리 시드 + (가능하면) demo_share 쿠키 세팅 + 스냅샷 로드 → /studio 로 데모 진입.
//   스튜디오 경로에 ?share=<토큰> 을 실어 보내므로 쿠키가 차단된 브라우저에서도 열린다(URL 티켓).
//   전체 새로고침 시엔 studio 부팅이 토큰(쿠키 또는 URL)으로 스냅샷을 재fetch 한다.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DEMO_SHARE_COOKIE, setDemoSnapshot, setDemoToken } from '@/lib/demo/context'
import type { ProjectSnapshot } from '@/lib/demo/types'
import { parseAppLocale } from '@/lib/locale'
import { useLocaleStore } from '@/stores/locale-store'
import { useT } from '@/lib/i18n'

export default function SharePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const t = useT()
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
          if (!cancelled) setError(t('This link has expired or is invalid.'))
          return
        }
        const snapshot = (await res.json()) as ProjectSnapshot
        if (cancelled) return
        setDemoSnapshot(snapshot)
        // 공유 뷰는 프로젝트의 locale 로 표시 (#i18n-s5, 오너 결정) — 표시 전용 전환(저장 없음).
        //   persist 캐시 덕에 스튜디오 새로고침(스냅샷 재fetch 경로)에도 유지된다.
        const projectLocale = parseAppLocale(
          (snapshot.project as { locale?: unknown } | null)?.locale,
        )
        if (projectLocale) useLocaleStore.getState().setLocaleForDisplay(projectLocale)
        const pid = snapshot?.projectId
        const ticket = `share=${encodeURIComponent(token)}`
        router.replace(
          pid
            ? `/studio/producer?projectId=${encodeURIComponent(pid)}&${ticket}`
            : `/studio/producer?${ticket}`,
        )
      } catch {
        if (!cancelled) setError(t('Could not load the preview.'))
      }
    })()

    return () => {
      cancelled = true
    }
    // t 는 locale 파생 순수 함수 — 의존성에 넣으면 locale 전환마다 재fetch 되므로 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token, router])

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {error ?? t('Preparing preview…')}
    </div>
  )
}
