'use client'

// Storyboard → Director 넘김 확인 창 (리뉴얼 1차 2026-10-19, 프로토타입 S7 → 디자이너 1110 확정 D0, 2026-11-14).
//   무엇이 넘어가는지 · 다음에 무엇을 얼마나 걸려 만드는지 · 그다음 Take 가 얼마 드는지 보이고,
//   "넘어가면서 이미지 만들기(추천)"와 "넘어가서 직접 고르기" 중 하나를 고른다(창을 열 때마다 추천이 골라져 있다).
//   러프가 없는 샷은 이번에 빠진다고 알리며 [남은 컷 그리기]를 같이 둔다(페이지 추천 — 지금 그대로).
//   문구와 숫자는 lib/writer/board-summary 의 directorConfirmView 가 정한다 — 여기는 그리기만 한다.
//   v3(2026-11-03 오너 결정 8): 맨 위에 큰 Lumi(지금 단계 Storyboard 옷 · 기본 모습) — 넘김 확인 창들과 같은 ConfirmLumi.
//   11/5 SYS 팝업(오너 2026-11-09): 폭은 틀 기본 520, 취소 [아니요] = secondary · 확인 = 크림. [남은 컷 그리기]는 ghost(검토 C 3).
import { useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { ConfirmLumi } from '@/components/handoff/confirm-lumi'
import { OptionCard } from '@/components/controls/choice-chip'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import type { DirectorConfirmView, DirectorHandoffChoice } from '@/lib/writer/board-summary'

export function StoryboardDirectorDialog({
  open,
  view,
  onClose,
  onDrawRemaining,
  onConfirm,
}: {
  open: boolean
  view: DirectorConfirmView
  onClose: () => void
  onDrawRemaining: () => void
  onConfirm: (choice: DirectorHandoffChoice) => void
}) {
  const t = useT()
  // 창을 열 때마다 추천으로 시작한다 — 닫혔다 열리면 컴포넌트를 새로 그린다(key).
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      {open ? <DirectorDialogBody key={view.defaultChoice} view={view} onClose={onClose} onDrawRemaining={onDrawRemaining} onConfirm={onConfirm} t={t} /> : null}
    </Dialog>
  )
}

function DirectorDialogBody({
  view,
  onClose,
  onDrawRemaining,
  onConfirm,
  t,
}: {
  view: DirectorConfirmView
  onClose: () => void
  onDrawRemaining: () => void
  onConfirm: (choice: DirectorHandoffChoice) => void
  t: ReturnType<typeof useT>
}) {
  const [choice, setChoice] = useState<DirectorHandoffChoice>(view.defaultChoice)
  return (
    <DialogContent aria-describedby={undefined} data-testid="storyboard-director-dialog">
      <DialogHeader>
        <ConfirmLumi stage="writer" />
        <DialogTitle>{view.title}</DialogTitle>
        {view.description ? <DialogDescription>{view.description}</DialogDescription> : null}
      </DialogHeader>

      <dl className="divide-y divide-border-subtle overflow-hidden rounded-xl bg-card">
        {view.rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-4 px-4 py-2.5 text-label">
            <dt className="w-24 shrink-0 text-caption text-subtle-foreground">{row.label}</dt>
            <dd className="min-w-0 flex-1 font-medium tabular-nums text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div role="radiogroup" aria-label={view.title} className="flex flex-col gap-2">
        <OptionCard
          role="radio"
          title={view.makeImages.label}
          description={view.makeImages.description}
          recommended
          selected={choice === 'makeImages'}
          disabled={view.makeImages.disabled}
          onClick={() => setChoice('makeImages')}
          data-testid="storyboard-director-make-images"
        />
        <OptionCard
          role="radio"
          title={view.pickYourself.label}
          description={view.pickYourself.description}
          selected={choice === 'pickYourself'}
          onClick={() => setChoice('pickYourself')}
          data-testid="storyboard-director-pick-yourself"
        />
      </div>

      {view.warning ? (
        <p className="flex gap-2 rounded-xl bg-warning/10 p-4 text-label leading-relaxed" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>{view.warning}</span>
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          {t('No')}
        </Button>
        {view.canDrawRemaining ? (
          <Button variant="ghost" onClick={onDrawRemaining} data-testid="storyboard-director-draw-remaining">
            {t('Draw the remaining cuts')}
          </Button>
        ) : null}
        <Button onClick={() => onConfirm(choice)} data-testid="storyboard-director-confirm">
          {t('Move over')}
          <ArrowRight className="size-4" />
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
