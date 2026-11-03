'use client'

// Storyboard → Director 넘김 확인 창 (리뉴얼 1차 2026-10-19, 프로토타입 S7).
//   넘어가는 샷 수 · 러닝타임을 보여 주고, 러프가 없는 샷은 이번에 빠진다고 알리며 [남은 컷 그리기]를 같이 둔다.
//   문구와 숫자는 lib/writer/board-summary 의 directorConfirmView 가 정한다 — 여기는 그리기만 한다.
//   v3(2026-11-03 오너 결정 8): 단계를 넘기기 전에 "~할까요?"를 묻는 확인 창이라 맨 위에 큰 Lumi(지금 단계 Storyboard 옷 · 기본 모습)를 둔다 —
//   넘김 확인 창들과 같은 ConfirmLumi(handoff/confirm-lumi) 하나를 쓴다.
import { AlertTriangle } from 'lucide-react'
import { ConfirmLumi } from '@/components/handoff/confirm-lumi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import type { DirectorConfirmView } from '@/lib/writer/board-summary'

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
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined} data-testid="storyboard-director-dialog">
        <ConfirmLumi stage="writer" />
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle>{view.title}</DialogTitle>
        </DialogHeader>

        <dl className="divide-y divide-border-subtle overflow-hidden rounded-xl bg-card">
          {view.rows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-4 px-4 py-2.5 text-label">
              <dt className="w-24 shrink-0 text-caption text-subtle-foreground">{row.label}</dt>
              <dd className="min-w-0 flex-1 font-medium tabular-nums text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>

        {view.warning ? (
          <p className="flex gap-2 rounded-xl bg-warning/10 p-4 text-label leading-relaxed" role="note">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>{view.warning}</span>
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('No')}
          </Button>
          {view.canDrawRemaining ? (
            <Button variant="secondary" onClick={onDrawRemaining} data-testid="storyboard-director-draw-remaining">
              {t('Draw the remaining cuts')}
            </Button>
          ) : null}
          <Button onClick={onConfirm} data-testid="storyboard-director-confirm">
            {t('Yes, hand over')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
