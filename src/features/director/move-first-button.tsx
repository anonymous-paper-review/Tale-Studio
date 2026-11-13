'use client'

// 차례를 기다리는 샷의 [먼저 하기](시안 D4 · 결정 페이지 추천, 리드 S4-2 7) — 그 샷을 영상 묶음의 다음 차례로. 카드는 꼬리 옆 알약, 노드는 꼬리 줄 안.
//   이미지에는 없다(4샷 한 장이라 줄이 없음, S4 혼자 정한 것 d). 약속: tests/director/move-first.test.ts
import { useState } from 'react'
import { ChevronsUp } from 'lucide-react'
import { toast } from 'sonner'

import { useT } from '@/lib/i18n'
import { moveVideoBatchShotFirst } from '@/lib/director/video-batch-order'
import { cn } from '@/lib/utils'

export function MoveFirstButton({ shotId, place = 'card' }: { shotId: string; place?: 'card' | 'node' }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation()
        if (busy) return
        setBusy(true)
        void moveVideoBatchShotFirst(shotId)
          .then((result) => {
            if (result === 'failed') toast.error(t('Could not change the order. Try again.'))
          })
          .finally(() => setBusy(false))
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'nodrag inline-flex shrink-0 items-center gap-1 rounded-full text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        place === 'card'
          ? 'bg-black/55 px-2 py-0.5 text-foreground hover:bg-black/70'
          : 'px-1.5 text-muted-foreground hover:text-foreground',
      )}
    >
      <ChevronsUp className="size-3" />
      {t('Do this first')}
    </button>
  )
}
