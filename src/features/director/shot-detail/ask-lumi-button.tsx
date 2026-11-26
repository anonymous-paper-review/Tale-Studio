'use client'

// [Lumi 에게 고쳐 달라고 하기](오너 2026-11-26 D6) — 고치기 칸에 글이 있을 때 다시 만들기 단추 자리에 선다. 글은 채팅으로 가고(ask-lumi-fix),
//   채팅이 샷 프롬프트를 고친 글 카드의 [적용]이 다시 만든다. 시안 없음 — 지금 다시 만들기 단추와 같은 크기 · 모양.
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import type { AskLumiVideoTake, FixKind } from './ask-lumi-fix'

export function AskLumiButton({ shotNodeId, kind, change, closeDetail, onSent, take }: {
  shotNodeId: string
  kind: FixKind
  change: string
  /** 영상 고치기: 고른 모델 · 해상도 · 보던 Take — 채팅 부탁에 맡긴다(검토 rev-director 2번). */
  take?: AskLumiVideoTake
  /** 스토리보드 보기 팝업이면 보낸 뒤 닫는다(채팅의 [적용]이 보이게). */
  closeDetail: boolean
  /** 보냈으면 칸을 비운다. */
  onSent?: () => void
}) {
  const t = useT()
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <div className="space-y-1">
      <Button type="button" size="sm" className="gap-1.5" onClick={async () => {
        // 채팅 상점은 누를 때 불러온다 — 상세 화면을 불러오는 것만으로 채팅 상점 전체를 끌어오지 않게.
        const { askLumiToFix } = await import('./ask-lumi-fix')
        const result = askLumiToFix({ shotNodeId, kind, change, closeDetail, ...(take ? { take } : {}) })
        if (result === 'busy') {
          setNotice(t('Lumi is busy with another request. Try again when it is done.'))
          return
        }
        setNotice(null)
        if (result === 'sent') onSent?.()
      }}>
        <MessageCircle className="size-3.5" />
        {t('Ask Lumi to fix')}
      </Button>
      <p className="text-caption text-subtle-foreground">{t('Lumi adds this to the shot prompt. Apply it in the chat to make it again.')}</p>
      {notice ? <p className="text-caption text-destructive">{notice}</p> : null}
    </div>
  )
}
