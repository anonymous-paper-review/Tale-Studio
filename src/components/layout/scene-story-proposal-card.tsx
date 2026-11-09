'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { AiIcon } from '@/components/icons/v3-icons'
import { LumiAvatar } from '@/components/lumi/lumi'
import { Button } from '@/components/ui/button'
import { useLocale, useT } from '@/lib/i18n'
import { STAGE_PERSONA } from '@/lib/lumi'
import { changedSceneRows, type SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import { proposalChipText } from '@/lib/prose/revise-chat'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

/**
 * 씬 스토리 수정안 카드. look="writer"(Writer 산문, 11/5 시안 WL · WS · 오너 2026-11-09 결정 5)면 만드는 동안은 카드 대신 Lumi 점 세 개,
 *   준비되면 "수정안 · S2 · 1곳" 칩만 — 버리기 · 적용은 산문 안 "AI 수정안" 상자(features/prose/proposal-view)에서 한다.
 *   실패 · 충돌은 Writer 에서도 이 카드가 까닭과 [최신 내용으로 다시 제안] · [버리기]를 보인다. 약속: tests/writer/prose-revise-chat.test.ts
 */
export function SceneStoryProposalCard({ projectId, proposal, look = 'card' }: { projectId: string; proposal: SceneStoryProposalView; look?: 'card' | 'writer' }) {
  const t = useT()
  const locale = useLocale()
  const manualEdit = useGlobalChatStore((state) => state.sceneStoryEdit?.projectId === projectId)
  const [working, setWorking] = useState(false)
  const generating = proposal.status === 'generating'
  const failed = proposal.status === 'failed'
  const conflict = proposal.status === 'ready' && proposal.stale
  const disabled = manualEdit || working
  const changes = changedSceneRows(proposal.before, proposal.after)

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

  // 바꿀 곳이 없었던 수정안(디자이너 QA 1차 #01)은 카드로 보이지 않는다 — 화면이 버리고 채팅에 알린다(settleUnchangedSceneStoryProposal).
  if (failed && proposal.error === 'scene_story_proposal_unchanged') return null

  if (look === 'writer' && generating) {
    // 만드는 동안 — Lumi 가 생각 중(점 세 개). 잠금 중이라 카드의 [취소]는 누를 수 없었다.
    return (
      <div data-stage={STAGE_PERSONA.producer} className="mt-2 flex gap-2" role="status" data-testid="scene-story-proposal-thinking">
        <LumiAvatar persona={STAGE_PERSONA.producer} state="thinking" size="chat" />
        <div className="flex flex-col gap-3 rounded-xl rounded-tl-[6px] bg-chat-lumi-bubble px-[22px] py-[18px]">
          <p className="text-micro font-semibold leading-none text-stage">Lumi</p>
          <span className="chat-thinking-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="sr-only">{t('Lumi is writing the change')}</span>
        </div>
      </div>
    )
  }
  if (look === 'writer' && proposal.status === 'ready' && !conflict) {
    // 준비됨 — 어느 문단 몇 곳인지 칩 하나. 바로 위 Lumi 말("S2를 고쳐 봤어요…")에 이어 붙는다.
    return (
      <div data-stage={STAGE_PERSONA.producer} className="pl-[38px]" data-testid="scene-story-proposal-chip">
        <div className="rounded-xl bg-chat-lumi-bubble px-[22px] py-[14px]">
          <p className="inline-flex items-center gap-2 rounded-[10px] bg-side px-3.5 py-2.5 text-[12.5px] font-medium text-foreground">
            <AiIcon className="size-6 text-stage" aria-hidden />
            {proposalChipText(locale, proposal)}
          </p>
        </div>
      </div>
    )
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
