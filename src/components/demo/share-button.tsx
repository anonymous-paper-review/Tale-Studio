'use client'

// project-share-demo-mode — 소유자용 공유 링크 생성 버튼.
//   클릭 → POST /api/share(스냅샷 캡처+토큰 발급) → 전체 URL 클립보드 복사 + 토스트.
//   OwnerOnly 로 감싸 데모 세션에선 렌더 안 됨.
import { useState } from 'react'
import { Loader2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useProjectStore } from '@/stores/project-store'
import { useT } from '@/lib/i18n'

export function ShareButton() {
  const projectId = useProjectStore((s) => s.projectId)
  const [loading, setLoading] = useState(false)
  const t = useT()

  const createLink = async () => {
    if (!projectId || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const { path } = (await res.json()) as { path: string }
      const url = `${window.location.origin}${path}`
      await navigator.clipboard.writeText(url).catch(() => {})
      toast.success(t('Share link copied. It opens a read-only preview without logging in'))
    } catch {
      toast.error(t('Failed to create share link'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={createLink}
      disabled={!projectId || loading}
      aria-label={t('Create share link')}
      title={t('Create share link (read-only preview)')}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Share2 className="h-5 w-5" />
      )}
    </button>
  )
}
