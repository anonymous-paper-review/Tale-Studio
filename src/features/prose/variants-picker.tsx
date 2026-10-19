'use client'

// 세 가지 안 고르기(리뉴얼 1차 2026-10-19, 프로토타입 W4). 안마다 바뀐 문단만 보여 주고, 하나를 적용하거나 버린다.
//   1안(화면 탭)은 산문 위 팝업, 2안(채팅 탭)은 채팅 카드로 같은 내용을 그린다. 적용하기 전까지 산문은 그대로다.
import { useState } from 'react'
import { AlertTriangle, Check, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import { REWRITE_DIRECTION_LABELS, treatmentDiff } from '@/lib/producer/scene-story-rewrite'
import { proseConditionLine } from '@/lib/prose/conditions'
import { previewedVariant } from '@/components/layout/scene-story-rewrite-card'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

export function VariantsPicker({
  proposal,
  current,
  sceneText,
  className,
}: {
  proposal: SceneStoryProposalView
  /** 지금 산문(씬 id · 글) — 안마다 바뀐 문단을 고른다. */
  current: Array<{ sceneId: string; text: string }>
  sceneText: (beats: string[]) => string
  className?: string
}) {
  const t = useT()
  const locale = useLocale()
  const picked = useGlobalChatStore((s) => s.sceneStoryVariantPreview)
  const [working, setWorking] = useState(false)
  const chosen = previewedVariant(proposal, picked)
  const failed = proposal.status === 'failed'
  const chat = () => useGlobalChatStore.getState()

  const run = async (task: () => Promise<unknown>) => {
    if (working) return
    setWorking(true)
    try {
      await task()
    } finally {
      setWorking(false)
    }
  }
  const again = () => run(async () => {
    const discarded = await chat().resolveSceneStoryProposal('discard', proposal.id)
    if (!discarded || !useProjectStore.getState().projectId) return
    if (proposal.conditions) await chat().rewriteSceneStory(null, proposal.conditions)
    else if (proposal.level) await chat().rewriteSceneStory(proposal.level)
  })

  return (
    <div className={cn('space-y-3', className)} data-testid="prose-variants">
      {proposal.conditions ? (
        <p className="text-xs text-muted-foreground">{proseConditionLine(proposal.conditions, locale)}</p>
      ) : null}
      {failed ? (
        <p role="status" className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t('Could not write the three versions. Your prose is unchanged.')}
        </p>
      ) : null}
      <div className="space-y-2" role="radiogroup" aria-label={t('Three versions')}>
        {(proposal.variants ?? []).map((variant, index) => {
          const ready = variant.status === 'ready'
          const on = chosen?.id === variant.id
          const rows = ready
            ? treatmentDiff(current, variant.after.filter((scene) => scene.beats.length > 0).map((scene) => ({ sceneId: scene.sceneId, text: sceneText(scene.beats) })))
              .filter((row) => row.kind !== 'same')
            : []
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!ready || working}
              onClick={() => chat().previewSceneStoryVariant(proposal.id, variant.id)}
              data-testid="prose-variant"
              data-variant={variant.id}
              className={cn(
                'flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong',
                !ready && 'opacity-60',
              )}
            >
              <span className="flex items-center gap-2 text-sm">
                <b className="font-semibold">{t('Version {number}', { number: index + 1 })}</b>
                <span className="text-xs text-muted-foreground">
                  {variant.status === 'generating'
                    ? <Loader2 className="inline size-3 animate-spin" aria-label={t('Writing three versions…')} />
                    : variant.status === 'failed' ? t('Could not write this version') : t(REWRITE_DIRECTION_LABELS[variant.direction])}
                </span>
                {ready ? <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{t('{count} changed scenes', { count: rows.length })}</span> : null}
              </span>
              {rows.slice(0, 3).map((row, i) => (
                <span key={i} className="flex gap-2 text-xs leading-5 text-foreground/85">
                  <i className="w-6 shrink-0 font-mono not-italic text-muted-foreground">{row.number ? `S${row.number}` : ''}</i>
                  <span className="line-clamp-2">{row.kind === 'removed' ? <s className="text-muted-foreground">{row.before}</s> : row.after}</span>
                </span>
              ))}
              {variant.stale ? <span className="text-xs text-warning">{t('The prose changed. Write new versions from the latest prose.')}</span> : null}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button size="sm" variant="ghost" onClick={() => void again()} disabled={working} data-testid="prose-variants-again">
          <RefreshCw className="size-4" />{t('None of these · write again')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void run(() => chat().resolveSceneStoryProposal('discard', proposal.id))} disabled={working} data-testid="prose-variants-discard">
          <X className="size-4" />{t('Discard')}
        </Button>
        <Button
          size="sm"
          onClick={() => chosen && void run(() => chat().resolveSceneStoryProposal('apply', proposal.id, chosen.id))}
          disabled={working || !chosen || chosen.stale}
          data-testid="prose-variants-apply"
        >
          {working ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t('Apply this version')}
        </Button>
      </div>
    </div>
  )
}
