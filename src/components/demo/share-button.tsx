'use client'

// project-share-demo-mode — 소유자용 공유 링크 생성 버튼.
//   클릭 → POST /api/share(스냅샷 캡처+토큰 발급) → 전체 URL 클립보드 복사 + 토스트.
//   OwnerOnly 로 감싸 데모 세션에선 렌더 안 됨.
import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useProjectStore } from '@/stores/project-store'

export function ShareButton() {
  const projectId = useProjectStore((s) => s.projectId)
  const [loading, setLoading] = useState(false)

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
      toast.success('공유 링크 복사됨 — 로그인 없이 열리는 읽기전용 미리보기')
    } catch {
      toast.error('공유 링크 생성에 실패했어요')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={createLink}
      disabled={!projectId || loading}
      aria-label="공유 링크 만들기"
      title="공유 링크 만들기 (읽기전용 미리보기)"
      className="flex h-12 w-12 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
    >
      <Share2 className="h-5 w-5" />
    </button>
  )
}
