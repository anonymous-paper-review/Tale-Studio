'use client'

// 다시 쓰기 세 가지 안 고르기(2026-10-02 오너 — tale-proto-v04 "v1 · v2 · v3"). 조작은 채팅에서, 비교는 왼쪽 트리트먼트에서 한다.
//   안을 누르면 트리트먼트 미리 보기가 그 안으로 바뀌고, 적용하기 전까지 트리트먼트는 그대로다.
import { useState } from 'react'
import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import { REWRITE_DIRECTION_LABELS, REWRITE_LEVELS } from '@/lib/producer/scene-story-rewrite'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

/** 미리 볼 안 — 고른 안이 있으면 그것, 없으면 처음 나온 안. 채팅 카드와 트리트먼트가 같이 쓴다. */
export function previewedVariant(proposal: SceneStoryProposalView | null | undefined, picked: { proposalId: string; variantId: string } | null) {
  const ready = proposal?.variants?.filter((variant) => variant.status === 'ready') ?? []
  if (!ready.length) return null
  return ready.find((variant) => picked?.proposalId === proposal!.id && variant.id === picked.variantId) ?? ready[0]
}

export function SceneStoryRewriteCard({ projectId, proposal }: { projectId: string; proposal: SceneStoryProposalView }) {
  const t = useT()
  const manualEdit = useGlobalChatStore((state) => state.sceneStoryEdit?.projectId === projectId)
  const picked = useGlobalChatStore((state) => state.sceneStoryVariantPreview)
  const [working, setWorking] = useState(false)
  const level = REWRITE_LEVELS.find((option) => option.level === proposal.level)
  const generating = proposal.status === 'generating'
  const failed = proposal.status === 'failed'
  const current = previewedVariant(proposal, picked)
  const stale = !!current?.stale
  const disabled = manualEdit || working

  const run = async (task: () => Promise<unknown>) => {
    if (disabled || useProjectStore.getState().projectId !== projectId) return
    setWorking(true)
    try {
      await task()
    } finally {
      setWorking(false)
    }
  }
  const chat = () => useGlobalChatStore.getState()

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-3 text-xs" data-testid="scene-story-rewrite" aria-label={t('Rewrite')}>
      <div className="flex items-center gap-2 font-medium">
        {generating ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="size-4 text-stage-producer" aria-hidden />}
        <h3>{t('Rewrite · {level}', { level: t(level?.label ?? 'Rewrite') })}</h3>
      </div>
      {generating ? <p className="leading-5 text-muted-foreground">{t('Writing three versions…')}</p> : null}
      {failed ? (
        <p role="status" className="flex items-start gap-2 leading-5 text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t('Could not write the three versions. Your treatment is unchanged.')}
        </p>
      ) : null}
      {stale && !generating ? (
        <p role="status" className="flex items-start gap-2 leading-5 text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t('The treatment changed. Write new versions from the latest treatment.')}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('Three versions')}>
        {(proposal.variants ?? []).map((variant) => {
          const ready = variant.status === 'ready'
          const on = current?.id === variant.id
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!ready || disabled}
              data-testid="scene-story-variant"
              data-variant={variant.id}
              onClick={() => chat().previewSceneStoryVariant(proposal.id, variant.id)}
              className={cn(
                'flex min-h-14 flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed',
                on ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:border-border-strong',
                !ready && 'opacity-60',
              )}
            >
              <span className="font-mono text-[11px] font-semibold">{variant.id}</span>
              <span className="text-[11px] leading-4 text-muted-foreground">
                {variant.status === 'generating' ? <Loader2 className="inline size-3 animate-spin" aria-label={t('Writing three versions…')} /> : variant.status === 'failed' ? t('Could not write this version') : t(REWRITE_DIRECTION_LABELS[variant.direction])}
              </span>
            </button>
          )
        })}
      </div>
      {current && !generating ? <p className="leading-5 text-muted-foreground">{t('Compare in the treatment on the left, then apply the one you like.')}</p> : null}

      <div className="flex flex-col gap-1.5">
        {current && !stale ? (
          <Button size="sm" disabled={disabled || generating} onClick={() => void run(() => chat().resolveSceneStoryProposal('apply', proposal.id, current.id))} data-testid="scene-story-variant-apply">
            <Check className="size-3.5" />{t('Apply {version}', { version: current.id })}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => void run(() => chat().resolveSceneStoryProposal('discard', proposal.id))} data-testid="scene-story-rewrite-discard">
          <X className="size-3.5" />{generating ? t('Cancel') : t('Keep the original')}
        </Button>
        {!generating && proposal.level ? (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void run(() => chat().regenerateSceneStoryRewrite(proposal.id, proposal.level!))} data-testid="scene-story-rewrite-again">
            <RefreshCw className="size-3.5" />{failed || stale ? t('Write again') : t('None of these · write again')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}

/** 안을 적용한 뒤(시안 v04 "vN로 바꿨어요") — 그대로 두거나 적용 전 트리트먼트로 되돌린다. */
export function SceneStoryUndoCard({ projectId, undo }: { projectId: string; undo: { id: string; label: string } }) {
  const t = useT()
  const [working, setWorking] = useState(false)
  const run = async (action: 'undo' | 'keep') => {
    if (working || useProjectStore.getState().projectId !== projectId) return
    setWorking(true)
    try {
      await useGlobalChatStore.getState().resolveSceneStoryUndo(action, undo.id)
    } finally {
      setWorking(false)
    }
  }
  return (
    <section className="space-y-2 rounded-xl border border-dashed border-border bg-card p-3 text-xs" data-testid="scene-story-undo">
      <p className="font-medium">{t('Switched to {version}', { version: undo.label })}</p>
      <p className="leading-5 text-muted-foreground">{t('If you do not like it, go back to the previous treatment.')}</p>
      <div className="flex flex-col gap-1.5">
        <Button size="sm" disabled={working} onClick={() => void run('keep')} data-testid="scene-story-undo-keep">{t('Keep it')}</Button>
        <Button size="sm" variant="outline" disabled={working} onClick={() => void run('undo')} data-testid="scene-story-undo-back">{t('Go back to the previous treatment')}</Button>
      </div>
    </section>
  )
}
