'use client'

// 카드 · 노드의 [멈추기](시안 D4 406:5275 · 오너 2026-11-14 7번) — 그 샷이 지금 만드는 이미지나 영상을 화면에서 멈춘다.
//   fal 에서는 끝까지 돌고 Take 는 돌려주지 않는다. 이미지는 4샷 한 장이 작업 하나라 같은 장의 샷이 같이 멈춘다(S4 혼자 정한 것 c) —
//   단추에 마우스를 올리면 미리 알리고, 멈춘 뒤 알림에도 몇 개인지 쓴다. 카드는 꼬리 옆, 노드는 기다리는 카드 안. 약속: tests/director/stop-each.test.ts
import { useState } from 'react'
import { Square } from 'lucide-react'
import { toast } from 'sonner'

import { useT } from '@/lib/i18n'
import { stopShotWork, type ShotStopTarget } from '@/lib/director/stop-work'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'

export function StopMakingButton({
  target,
  kind,
  place = 'card',
}: {
  target: ShotStopTarget
  kind: 'image' | 'video'
  /** card = 카드 꼬리 옆 알약, wait = 노드를 덮은 기다리는 카드 안(시안 D4). */
  place?: 'card' | 'wait'
}) {
  const t = useT()
  const cancelRunningJobs = useDirectorCanvasStore((s) => s.cancelRunningJobs)
  const [busy, setBusy] = useState(false)
  const sameSheet = kind === 'image' && target.sheetShots > 1
    ? t('{count} shots on the same sheet stop together', { count: target.sheetShots })
    : undefined
  return (
    <button
      type="button"
      disabled={busy}
      title={sameSheet}
      onClick={(event) => {
        event.stopPropagation()
        if (busy) return
        setBusy(true)
        void stopShotWork(cancelRunningJobs, target, kind)
          .then((result) => {
            if (result.ok) toast.info(t(result.text, result.params))
            else toast.error(t(result.text))
          })
          .finally(() => setBusy(false))
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'nodrag inline-flex shrink-0 items-center gap-1 rounded-full font-semibold text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        place === 'card'
          ? 'bg-black/55 px-2 py-0.5 text-[11px] hover:bg-black/70'
          : 'h-7 border border-border px-3 text-[12px] hover:bg-card',
      )}
    >
      <Square className="size-2.5 fill-current" />
      {t('Stop making')}
    </button>
  )
}
