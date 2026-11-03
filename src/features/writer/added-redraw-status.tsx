'use client'

// 그려 둔 더한 샷을 고친 내용으로 다시 그리는 차례(그리는 동안 고친 샷, 리뷰 R3)가 기다리거나 멈췄을 때 그림 아래에 붙는 한 줄(2026-11-02 최종 리뷰 L2).
//   그림은 고치기 전 내용이다 — 기다리면 "자리가 나면 고친 내용으로 다시 그려요", 멈추면 까닭과 [다시 시도](고친 내용으로 덮어 그리기).
//   v3(2026-11-03): 카드 안 작은 판(카드색 · 멈추면 오류 색 10%) — 카드의 줄 간격이 띄우므로 위 여백은 두지 않는다.
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
      <p role="status" className="flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1.5 text-caption text-muted-foreground">
        <Clock className="size-3.5 shrink-0" aria-hidden />
        {t('Redraws with your changes as soon as a slot frees up')}
      </p>
    )
  }
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 px-2.5 py-1.5">
      <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-hidden />
      <p className="line-clamp-2 min-w-0 flex-1 text-caption text-destructive">{job.error ?? t('Generation failed')}</p>
      <Button
        size="xs"
        variant="secondary"
        className="rounded-full"
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
