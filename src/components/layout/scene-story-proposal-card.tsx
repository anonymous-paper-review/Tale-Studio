'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import type { SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

export function SceneStoryProposalCard({ projectId, proposal }: { projectId: string; proposal: SceneStoryProposalView }) {
  const t = useT()
  const manualEdit = useGlobalChatStore((state) => state.sceneStoryEdit?.projectId === projectId)
  const [working, setWorking] = useState(false)
  const generating = proposal.status === 'generating'
  const failed = proposal.status === 'failed'
  const conflict = proposal.status === 'ready' && proposal.stale
  const disabled = manualEdit || working
  const changes = [...new Set([...proposal.before, ...proposal.after].map((scene) => scene.sceneId))].flatMap((id) => {
    const before = proposal.before.find((scene) => scene.sceneId === id)
    const after = proposal.after.find((scene) => scene.sceneId === id)
    return before?.index === after?.index && JSON.stringify(before?.beats) === JSON.stringify(after?.beats) ? [] : [{ id, before, after }]
  })

  const resolve = async (action: 'apply' | 'discard') => {
    if (disabled || useProjectStore.getState().projectId !== projectId) return
    setWorking(true)
    await useGlobalChatStore.getState().resolveSceneStoryProposal(action, proposal.id)
    setWorking(false)
  }
  const regenerate = async () => {
    if (disabled || useProjectStore.getState().projectId !== projectId) return
    setWorking(true)
    const chat = useGlobalChatStore.getState()
    const discarded = await chat.resolveSceneStoryProposal('discard', proposal.id)
    if (discarded && useProjectStore.getState().projectId === projectId) await chat.reviseSceneGate(proposal.feedback)
    setWorking(false)
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-3 text-xs" data-testid="scene-story-proposal" aria-label={t('Scene story proposal')}>
      <div className="flex items-center gap-2 font-medium">
        {generating ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="size-4 text-stage-producer" aria-hidden />}
        <h3>{generating ? t('Creating a scene story proposal…') : t('Scene story proposal')}</h3>
      </div>
      <p className="whitespace-pre-wrap leading-5 text-muted-foreground">{proposal.feedback}</p>
      {generating ? <p className="leading-5 text-muted-foreground">{t('You can keep chatting and editing. The original stays unchanged until you apply the proposal.')}</p> : null}
      {failed ? <p role="status" className="flex items-start gap-2 leading-5 text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t('Could not create the proposal. Your scene story is unchanged.')}</p> : null}
      {conflict ? <p role="status" className="flex items-start gap-2 leading-5 text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t('The scene story changed. Ask for a new proposal based on the latest version.')}</p> : null}
      {proposal.status === 'ready' ? (
        <details className="rounded-lg border border-border px-3 py-2" open>
          <summary className="cursor-pointer font-medium">{t('Compare {count} changed scenes', { count: changes.length })}</summary>
          <div className="mt-3 max-h-72 space-y-4 overflow-y-auto">
            {changes.map(({ id, before, after }) => (
              <div key={id} className="space-y-2">
                <p className="font-medium">{t('Scene {n}', { n: (after?.index ?? before?.index ?? 0) + 1 })}</p>
                <details className="rounded-lg bg-muted/50 p-2">
                  <summary className="cursor-pointer font-medium text-muted-foreground">{t('Before')}{before ? ` · ${t('Scene {n}', { n: before.index + 1 })}` : ''}</summary>
                  <p className="mt-2 whitespace-pre-wrap leading-5 text-muted-foreground">{before?.beats.join('\n\n') || t('No scene')}</p>
                </details>
                <div className="rounded-lg border border-stage-producer/30 bg-stage-producer/5 p-2">
                  <p className="mb-1 font-medium">{t('Proposal')}{after ? ` · ${t('Scene {n}', { n: after.index + 1 })}` : ''}</p>
                  <p className="whitespace-pre-wrap leading-5">{after?.beats.join('\n\n') || t('No scene')}</p>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void resolve('discard')} data-testid="scene-story-proposal-discard"><X className="size-3.5" />{generating ? t('Cancel') : t('Discard')}</Button>
        {conflict || failed ? (
          <Button size="sm" disabled={disabled} onClick={() => void regenerate()} data-testid="scene-story-proposal-regenerate"><RefreshCw className="size-3.5" />{t('Propose from latest version')}</Button>
        ) : proposal.status === 'ready' ? (
          <Button size="sm" disabled={disabled} onClick={() => void resolve('apply')} data-testid="scene-story-proposal-apply"><Check className="size-3.5" />{t('Apply')}</Button>
        ) : null}
      </div>
    </section>
  )
}
