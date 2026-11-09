'use client'

// Writer 산문 수정안을 산문 안에서 본다(11/5 시안 WS, 오너 2026-11-09 결정 5 추천대로) — 바뀐 문단은 원래 글을 같은 크기 지운 줄(회색)로 두고,
//   바로 아래 "AI 수정안" 상자(지금 단계 색 8% 바탕 · 1px 테두리 · 모서리 12 · 안쪽 16/20)에 새 글(15)을 보인다.
//   [버리기] · [적용]은 그 상자 안 작은 알약 — 수정안은 한 덩어리로 적용되므로 바뀐 문단이 여럿이면 마지막 상자에만 둔다(혼자 정한 것).
//   세 가지 안 미리 보기 · Producer 트리트먼트는 예전 비교(TreatmentDiffView, 새 글 초록) 그대로. 약속: tests/writer/prose-proposal-box.test.ts
import { useState } from 'react'
import { AiIcon } from '@/components/icons/v3-icons'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import type { SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'
import type { TreatmentDiffRow } from '@/lib/producer/scene-story-rewrite'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'

export function ProseProposalView({ rows, proposal }: { rows: TreatmentDiffRow[]; proposal: Pick<SceneStoryProposalView, 'id'> }) {
  const t = useT()
  const projectId = useProjectStore((s) => s.projectId)
  // 채팅 카드와 같은 규칙 — 산문을 직접 고치는 창이 열려 있거나 처리하는 동안은 정하지 않는다.
  const manualEdit = useGlobalChatStore((s) => s.sceneStoryEdit?.projectId === projectId)
  const [working, setWorking] = useState(false)
  const disabled = manualEdit || working
  const lastChanged = rows.reduce((at, row, index) => (row.kind === 'same' ? at : index), -1)

  const resolve = async (action: 'apply' | 'discard') => {
    if (disabled || !projectId || useProjectStore.getState().projectId !== projectId) return
    setWorking(true)
    try {
      await useGlobalChatStore.getState().resolveSceneStoryProposal(action, proposal.id)
    } finally {
      setWorking(false)
    }
  }

  return (
    <article className="space-y-1" data-testid="prose-proposal">
      {rows.map((row, index) => (
        <div key={index} className="flex gap-4 rounded-[14px] py-4 pl-4 pr-6" data-diff-row={row.kind}>
          <span className="w-4 shrink-0 pt-1 font-num text-micro font-semibold text-foreground">{row.number ? `S${row.number}` : ''}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            {row.kind === 'same' ? <p className="select-text text-prose text-foreground">{row.after}</p> : null}
            {row.kind === 'changed' || row.kind === 'removed' ? (
              <p className="select-text text-prose text-subtle-foreground line-through decoration-subtle-foreground/70" data-diff="old">
                <span className="sr-only">{t('Previous text')}: </span>
                {row.before}
              </p>
            ) : null}
            {row.kind !== 'same' ? (
              <div className="flex flex-col gap-3 rounded-[12px] border border-stage bg-stage/8 px-5 py-4" data-testid="prose-proposal-box">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-stage">
                  <AiIcon className="size-6" aria-hidden />
                  {t('AI proposal')}
                </p>
                {row.kind === 'removed' ? (
                  <p className="text-[15px] leading-[1.7] text-muted-foreground">{t('This scene is removed in the proposal.')}</p>
                ) : (
                  <p className="select-text text-[15px] leading-[1.7] text-foreground" data-diff="new">
                    <span className="sr-only">{t('New text')}: </span>
                    {row.after}
                  </p>
                )}
                {index === lastChanged ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="pill" variant="secondary" disabled={disabled} onClick={() => void resolve('discard')} data-testid="prose-proposal-discard">{t('Discard')}</Button>
                    <Button size="pill" disabled={disabled} onClick={() => void resolve('apply')} data-testid="prose-proposal-apply">{t('Apply')}</Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </article>
  )
}
