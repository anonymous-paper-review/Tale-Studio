'use client'

// 다음 화 산문 화면 맨 위 띠(2026-10-26 · 프로토타입 W1s · WS) — 앞 화 제목과 [앞 화 줄거리 보기].
//   줄거리 보기는 앞 화 확정 산문을 읽기 전용 창으로 연다(프로젝트 목록의 산문 보기와 같은 창).
//   앞 화를 지웠으면 버튼 없이 "앞 화 줄거리 없이 써요" 안내만 보인다.
//   약속: tests/writer/series-prose-banner.test.ts
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PrevProseDialog } from '@/features/projects/next-episode-dialog'
import { useT } from '@/lib/i18n'
import type { SeriesView } from '@/lib/series/view'

export function ProseSeriesBanner({ projectId, view }: { projectId: string | null; view: SeriesView }) {
  const t = useT()
  const [proseOpen, setProseOpen] = useState(false)
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-6 py-2.5 text-sm" role="status" data-testid="prose-series-banner">
      {view.prevDeleted ? (
        <>
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
          <p className="min-w-0 flex-1">
            {t('The previous episode was deleted. From now on [AI rewrite] writes without the story of the previous episode. The characters, backgrounds and art style you carried over are still here.')}
          </p>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1">{t('The next episode of "{title}"', { title: view.prevTitle })}</p>
          <Button variant="outline" size="sm" onClick={() => setProseOpen(true)} disabled={!projectId}>
            {t('View the previous episode story')}
          </Button>
          <PrevProseDialog project={proseOpen && projectId ? { id: projectId, title: view.prevTitle } : null} onClose={() => setProseOpen(false)} />
        </>
      )}
    </div>
  )
}
