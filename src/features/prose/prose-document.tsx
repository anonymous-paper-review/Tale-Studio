'use client'

// 산문 본문(리뉴얼 1차 2026-10-19, 프로토타입 W1 w-prose). S1 · S2 … 문단, 다시 쓰기 안을 미리 볼 때는 바뀐 문단만
//   이전 글 · 새 글로 함께, 대본을 그대로 쓰는 프로젝트는 원본 대본을 그대로 보인다.
import { useState } from 'react'
import { useAiBusyHold } from '@/hooks/use-ai-busy-hold'
import { AlertTriangle, Loader2, RotateCcw, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { TreatmentDiffView } from '@/features/producer/treatment-diff-view'
import { useProducerStore } from '@/stores/producer-store'
import type { ProseState } from '@/features/prose/use-prose'

// 산문 박스는 안에서 따로 스크롤하지 않는다 — 글이 길면 박스가 길어지고, 화면 영역(화면에서 고치기)이나
//   채팅 영역(채팅으로 고치기)이 스크롤된다(2026-10-20 오너 "박스 안 스크롤 말고 메인 뷰가 스크롤").
export function ProseDocument({ prose }: { prose: ProseState }) {
  const t = useT()
  const [starting, setStarting] = useState(false)
  // [산문 쓰기]를 누른 뒤 Writer 가 쓰기 시작했다고 알릴 때까지도 왼쪽 사이드바를 막는다(2026-10-27) — 그 사이 다른 단계로 옮겨 갈 수 있었다.
  useAiBusyHold(starting)
  const { view, diffRows, phase, draftLive } = prose

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
    return <pre className="whitespace-pre-wrap font-mono text-[13px] leading-6 text-foreground/90" data-testid="prose-original">{view.text}</pre>
  }
  // 실행 기록(산문 본문)을 읽는 중 — 그 전에 저장된 씬 한 줄 요약을 본문처럼 그리지 않는다(디자이너 QA 1차 #09).
  if (view.kind === 'loading') {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status" data-testid="prose-loading">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        {t('Loading…')}
      </p>
    )
  }
  if (view.kind === 'scenes' && prose.paragraphs.length) {
    return (
      <article className="space-y-4" data-testid="prose-article">
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
      {/* [산문 쓰기]는 진행 상태를 읽어 Writer 가 아직 쓴 적이 없다고 안 뒤에만(디자이너 QA 1차 #07). */}
      {prose.startOffered ? (
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
