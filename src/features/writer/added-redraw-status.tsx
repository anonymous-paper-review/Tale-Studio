'use client'

// 그려 둔 더한 샷을 고친 내용으로 다시 그리는 차례(그리는 동안 고친 샷, 리뷰 R3)가 기다리거나 멈췄을 때 그림 아래에 붙는 한 줄(2026-11-02 최종 리뷰 L2).
//   그림은 고치기 전 내용이다 — 기다리면 "자리가 나면 고친 내용으로 다시 그려요", 멈추면 까닭과 [다시 시도](고친 내용으로 덮어 그리기).
import { AlertCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

export function AddedRedrawStatus({
  job,
  onRetry,
}: {
  job: { status: 'waiting' | 'failed'; error?: string }
  onRetry: () => void
}) {
  const t = useT()
  if (job.status === 'waiting') {
    return (
      <p role="status" className="mt-2 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <Clock className="size-3.5 shrink-0" aria-hidden />
        {t('Redraws with your changes as soon as a slot frees up')}
      </p>
    )
  }
  return (
    <div role="alert" className="mt-2 flex items-center gap-2 px-1">
      <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-hidden />
      <p className="line-clamp-2 min-w-0 flex-1 text-xs text-destructive">{job.error ?? t('Generation failed')}</p>
      <Button
        size="xs"
        variant="outline"
        onClick={(event) => {
          event.stopPropagation()
          onRetry()
        }}
      >
        {t('Retry')}
      </Button>
    </div>
  )
}
