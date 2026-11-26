'use client'

// 산문 확정 창(리뉴얼 1차 2026-10-19, 프로토타입 W6 "산문을 확정할까요?"). [예, 확정하기]면 산문이 잠기고 콘티로 간다.
//   O1(오너 2026-11-26 "콘티를 Artist 앞에"): 확정하면 씬 · 샷 나누기가 바로 이어지고 콘티 화면이 열린다(features/prose/confirm-prose-flow).
//   O6(오너 2026-11-26 "산문 확정 창에서 한 번 고르게 하고 artist에서 계속 변경할 수 있게"): 그림체가 아직 없으면 이 창에서
//   Artist 와 같은 그림체 카드(StyleGrid)로 고른다 — 고르기 전에는 확정하지 않는다. 그림체가 있으면 지금처럼 확정만 묻는다.
//   넘길 때 러닝타임 검사는 없다. 확정한 산문은 고칠 수 없다(산문으로 돌아가 다시 쓰기는 2차).
//   v3(오너 2026-11-03 결정 8): 확인 창 맨 위에 큰 Lumi — 지금 단계(Writer) 옷 · 기본 모습.
import { useEffect, useState } from 'react'
import { ArrowRight, Loader2, Lock, Palette } from 'lucide-react'
import { ConfirmLumi } from '@/components/handoff/confirm-lumi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StyleGrid } from '@/features/artist-room/style-make-dialog'
import { useT } from '@/lib/i18n'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'
import { useConfirmProse } from '@/features/prose/writer-next-card'

export function ProseConfirmDialog() {
  const t = useT()
  const open = useWriterRoomStore((s) => s.confirmOpen)
  const confirm = useConfirmProse()
  const projectId = useProjectStore((s) => s.projectId)
  const anchors = useProducerStore((s) => s.styleAnchors)
  // O6: 작품 그림체(고른 그림체 · 올린 내 그림체)가 없을 때만 이 창에서 고른다.
  const needsStyle = useProducerStore((s) => !s.styleAnchorKey && !s.customStyleAnchor)
  const styleSetting = useGlobalChatStore((s) => !!projectId && s.styleSettingFor === projectId)
  const [picked, setPicked] = useState<string | null>(null)
  // 열 때마다 고른 것 없이 시작한다(렌더 중 맞춤 — set-state-in-effect 회피, 스타일 창과 같은 방법).
  const [openedWith, setOpenedWith] = useState<boolean>(open)
  if (open !== openedWith) {
    setOpenedWith(open)
    if (open) setPicked(null)
  }
  useEffect(() => {
    if (open && needsStyle && anchors.length === 0) void useProducerStore.getState().loadStyleAnchors()
  }, [open, needsStyle, anchors.length])
  const canConfirm = !confirm.busy && (!needsStyle || (!!picked && !styleSetting))

  // [아니오] · X · Esc = 확정하지 않고 닫기 — 그 뒤 고친 걸 적용해도 채팅이 같은 질문을 다시 하지 않는다(디자이너 QA 1차 #08).
  //   확정에 성공해 닫는 것은 useConfirmProse 의 closeConfirm 이라 여기를 지나지 않는다.
  const close = () => {
    if (!confirm.busy) useGlobalChatStore.getState().declineProseConfirm()
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      {/* 그림체를 고를 때는 Artist 스타일 창과 같은 넓은 창(11/5 SYS 748) — 고를 것이 없으면 지금처럼 기본 폭. */}
      <DialogContent size={needsStyle ? 'wide' : undefined} className={needsStyle ? 'flex max-h-[88vh] flex-col' : undefined} showCloseButton={!confirm.busy} data-testid="prose-confirm">
        <DialogHeader>
          <ConfirmLumi stage="producer" />
          <DialogTitle>{t('Confirm the prose?')}</DialogTitle>
          <DialogDescription className="sr-only">{t('Check what happens when you confirm the prose.')}</DialogDescription>
        </DialogHeader>
        <div className={needsStyle ? 'min-h-0 space-y-4 overflow-y-auto py-1' : undefined}>
          <dl className="space-y-3 text-sm">
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-muted-foreground">{t('Next')}</dt>
              <dd>{t('Splits the prose into scenes and shots and draws the rough storyboard.')}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="flex w-20 shrink-0 items-center gap-1 text-muted-foreground"><Lock className="size-3.5" aria-hidden />{t('Prose')}</dt>
              <dd>{t('Once you confirm, the prose is locked and cannot be changed.')}</dd>
            </div>
            {needsStyle ? (
              <div className="flex gap-3">
                <dt className="flex w-20 shrink-0 items-center gap-1 text-muted-foreground"><Palette className="size-3.5" aria-hidden />{t('Art style')}</dt>
                <dd>{t('Pick the art style for this work. You can change it in Artist anytime.')}</dd>
              </div>
            ) : null}
          </dl>
          {needsStyle ? (
            <StyleGrid
              anchors={anchors}
              picked={picked}
              onPick={setPicked}
              custom={null}
              locked={false}
              styleSetting={styleSetting}
              removing={false}
              busy={confirm.busy}
              onRemoveCustom={() => {}}
              prevStyleId={null}
              prevIsCustom={false}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={close} disabled={confirm.busy}>{t('No')}</Button>
          <Button onClick={() => void confirm.run(needsStyle ? picked : null)} disabled={!canConfirm} data-testid="prose-confirm-yes">
            {confirm.busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            {t('Yes, confirm it')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
