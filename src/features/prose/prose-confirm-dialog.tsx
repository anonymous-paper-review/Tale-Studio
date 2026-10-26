'use client'

// 산문 확정 창(리뉴얼 1차 2026-10-19, 프로토타입 W6 "산문을 확정할까요?"). [예, 확정하기]면 산문이 잠기고 Artist 로 간다.
//   넘길 때 러닝타임 검사는 없다. 확정한 산문은 고칠 수 없다(산문으로 돌아가 다시 쓰기는 2차).
import { ArrowRight, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import { useConfirmProse } from '@/features/prose/writer-next-card'

export function ProseConfirmDialog() {
  const t = useT()
  const open = useWriterRoomStore((s) => s.confirmOpen)
  const confirm = useConfirmProse()
  // [아니오] · X · Esc = 확정하지 않고 닫기 — 그 뒤 고친 걸 적용해도 채팅이 같은 질문을 다시 하지 않는다(디자이너 QA 1차 #08).
  //   확정에 성공해 닫는 것은 useConfirmProse 의 closeConfirm 이라 여기를 지나지 않는다.
  const close = () => {
    if (!confirm.busy) useGlobalChatStore.getState().declineProseConfirm()
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!confirm.busy} data-testid="prose-confirm">
        <DialogHeader>
          <DialogTitle>{t('Confirm the prose?')}</DialogTitle>
          <DialogDescription className="sr-only">{t('Check what happens when you confirm the prose.')}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted-foreground">{t('Next')}</dt>
            <dd>{t('Artist picks the characters and backgrounds from the prose.')}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="flex w-20 shrink-0 items-center gap-1 text-muted-foreground"><Lock className="size-3.5" aria-hidden />{t('Prose')}</dt>
            <dd>{t('Once you confirm, the prose is locked and cannot be changed.')}</dd>
          </div>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={confirm.busy}>{t('No')}</Button>
          <Button onClick={() => void confirm.run()} disabled={confirm.busy} data-testid="prose-confirm-yes">
            {confirm.busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            {t('Yes, confirm it')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
