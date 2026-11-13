'use client'

// 재생성 확인 팝업 (#regen-confirm 2026-08-11).
//
// 최초 생성과 재생성은 같은 행위가 아니다 — 재생성은 **이미 있는 결과물을 교체**하고 과금된다.
//   빈칸 채우기는 바로 실행하고, 차 있는 것을 갈아치우는 것만 이 팝업을 거친다
//   (rules/architecture §5: "빈칸 자율 채움 vs 차 있는 것 교체는 사람만").
//
// 채팅의 승인 게이트(pendingProposal)와 같은 문법으로 무엇이 바뀌는지를 먼저 보여준다.
//
// v3(2026-11-03, 오너 결정 8): "~할까요?"를 묻는 확인 창이라 위에 큰 Lumi(Director 옷, 기본 모습 — 공용 ConfirmLumi)를 둔다.
//   지우기 확인 · 오류 안내에는 두지 않는다(이 창은 다시 만들기 · 영상 일괄 만들기에만 쓴다).

import { Loader2 } from 'lucide-react'
import { ConfirmLumi } from '@/components/handoff/confirm-lumi'
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
  // 설명 줄이 비면 바뀌는 것 첫 줄이 곧 설명이다 — 빈 설명 줄을 그리지 않고, 화면 읽기도 그 줄을 설명으로 읽는다(검토 a · 리드 11/14).
  //   설명도 바뀌는 것도 없으면 설명 연결을 걸지 않는다(빈 설명을 가리키지 않게).
  const lead = description || impact[0] || ''
  const rest = description ? impact : impact.slice(1)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...(lead ? {} : { 'aria-describedby': undefined })}>
        <ConfirmLumi stage="director" />
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle>{title}</DialogTitle>
          {lead ? <DialogDescription>{lead}</DialogDescription> : null}
        </DialogHeader>
        {rest.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {rest.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
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
