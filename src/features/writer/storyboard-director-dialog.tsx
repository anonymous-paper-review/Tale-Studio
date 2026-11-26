'use client'

// Storyboard → Director 넘김 확인 창 (리뉴얼 1차 2026-10-19, 프로토타입 S7 → 디자이너 1110 확정 D0, 2026-11-14).
//   무엇이 넘어가는지 · 실사 그림이 아직 없는 샷이 몇 개인지 · 그다음 Take 가 얼마 드는지 보인다.
//   "넘어가면서 이미지 만들기" 고르기는 뺐다 — 실사는 Storyboard [시작]이 만든다(오너 2026-11-26 m1126 S2 · 리드 결정). 남은 실사는 Director 에서도 만든다.
//   러프가 없는 샷은 이번에 빠진다고 알리며 [남은 컷 그리기]를 같이 둔다(페이지 추천 — 지금 그대로).
//   문구와 숫자는 lib/writer/board-summary 의 directorConfirmView 가 정한다 — 여기는 그리기만 한다.
//   v3(2026-11-03 오너 결정 8): 맨 위에 큰 Lumi(지금 단계 Storyboard 옷 · 기본 모습) — 넘김 확인 창들과 같은 ConfirmLumi.
//   11/5 SYS 팝업(오너 2026-11-09): 폭은 틀 기본 520, 취소 [아니요] = secondary · 확인 = 크림. [남은 컷 그리기]는 ghost(검토 C 3).
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { ConfirmLumi } from '@/components/handoff/confirm-lumi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
      {open ? <DirectorDialogBody view={view} onClose={onClose} onDrawRemaining={onDrawRemaining} onConfirm={onConfirm} t={t} /> : null}
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
  onConfirm: () => void
  t: ReturnType<typeof useT>
}) {
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
        <Button onClick={onConfirm} data-testid="storyboard-director-confirm">
          {t('Move over')}
          <ArrowRight className="size-4" />
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
