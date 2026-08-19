'use client'

// 재생성 확인 팝업 (#regen-confirm 2026-08-11).
//
// 최초 생성과 재생성은 같은 행위가 아니다 — 재생성은 **이미 있는 결과물을 교체**하고 과금된다.
//   빈칸 채우기는 바로 실행하고, 차 있는 것을 갈아치우는 것만 이 팝업을 거친다
//   (rules/architecture §5: "빈칸 자율 채움 vs 차 있는 것 교체는 사람만").
//
// 채팅의 승인 게이트(pendingProposal)와 같은 문법으로 무엇이 바뀌는지를 먼저 보여준다.

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'

export function RegenerateConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  impact,
  confirmLabel,
  busy = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** 무엇이 바뀌는지 — 과금·교체처럼 되돌리기 어려운 것부터. */
  impact: string[]
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {impact.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {impact.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('Cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
