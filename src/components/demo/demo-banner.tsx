'use client'

// project-share-demo-mode — 데모 상단 배너. 데모 세션에서만 렌더.
import { useIsDemo } from '@/hooks/use-is-demo'
import { useT } from '@/lib/i18n'

export function DemoBanner() {
  const isDemo = useIsDemo()
  const t = useT()
  if (!isDemo) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center py-1.5">
      <div className="rounded-full border border-border bg-muted/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
        {t('Preview · generation disabled')}
      </div>
    </div>
  )
}
