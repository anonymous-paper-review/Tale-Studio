'use client'

// 산문 본문(리뉴얼 1차 2026-10-19, 프로토타입 W1 w-prose). S1 · S2 … 문단, 다시 쓰기 안을 미리 볼 때는 바뀐 문단만
//   이전 글 · 새 글로 함께, 대본을 그대로 쓰는 프로젝트는 원본 대본을 그대로 보인다.
import { useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { TreatmentDiffView } from '@/features/producer/treatment-diff-view'
import { useProducerStore } from '@/stores/producer-store'
import type { ProseState } from '@/features/prose/use-prose'

export function ProseDocument({ prose, compact = false }: { prose: ProseState; compact?: boolean }) {
  const t = useT()
  const storyReady = useProducerStore((s) => s.storyReady)
  const [starting, setStarting] = useState(false)
  const { view, diffRows, phase, draftLive, locked } = prose

  const startDraft = async () => {
    if (starting) return
    setStarting(true)
    try {
      const ok = await useProducerStore.getState().startTreatment()
      if (!ok) toast.error(t('Could not start writing the prose. Please try again.'))
    } finally {
      setStarting(false)
    }
  }

  if (draftLive && phase === 'failed') {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center" data-testid="prose-failed">
        <AlertTriangle className="size-8 text-warning" aria-hidden />
        <p className="text-sm font-medium">{t('Could not write the prose')}</p>
        <p className="max-w-md text-xs text-muted-foreground">{t('Your material and settings are kept. Please try again.')}</p>
        <Button size="sm" className="mt-2" onClick={() => void startDraft()} disabled={starting} data-testid="prose-retry">
          {starting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}{t('Try again')}
        </Button>
      </div>
    )
  }
  if (diffRows) return <TreatmentDiffView rows={diffRows} />
  if (view.kind === 'original') {
    return <pre className={cn('overflow-y-auto whitespace-pre-wrap font-mono text-[13px] leading-6 text-foreground/90', compact ? 'max-h-[24rem]' : '')} data-testid="prose-original">{view.text}</pre>
  }
  if (view.kind === 'scenes' && prose.paragraphs.length) {
    return (
      <article className={cn('space-y-4', compact && 'max-h-[28rem] overflow-y-auto pr-1')} data-testid="prose-article">
        {prose.paragraphs.map((paragraph, index) => (
          <div key={index} className="flex gap-3">
            <span className="w-7 shrink-0 pt-1 font-mono text-[11px] text-muted-foreground">S{index + 1}</span>
            <p className="text-[15px] leading-8 text-foreground/90">{paragraph}</p>
          </div>
        ))}
      </article>
    )
  }
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center" data-testid="prose-empty">
      <ScrollText className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{t('No prose yet')}</p>
      {!locked && storyReady && phase === 'before' ? (
        <>
          <p className="max-w-md text-xs text-muted-foreground">{t('Your story is ready. Writer writes the prose first, then you can rewrite or edit it here.')}</p>
          <Button size="sm" className="mt-2" onClick={() => void startDraft()} disabled={starting} data-testid="prose-start">
            {starting ? <Loader2 className="size-4 animate-spin" /> : <ScrollText className="size-4" />}{t('Write the prose')}
          </Button>
        </>
      ) : (
        <p className="max-w-md text-xs text-muted-foreground">{t('Writer is still writing the scenes. They appear here as they are ready.')}</p>
      )}
    </div>
  )
}
