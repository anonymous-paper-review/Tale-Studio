'use client'

// [Lumi 에게 고쳐 달라고 하기](오너 2026-11-26 D6) — 고치기 칸에 글이 있을 때 다시 만들기 단추 자리에 선다. 글은 채팅으로 가고(ask-lumi-fix),
//   그림은 Lumi 가 지금 그림을 바탕으로 바꿀 점만 고쳐 바로 다시 그리고(O8 (a)), 영상은 채팅에서 "응"이라고 하면 새 Take 를 만든다(O8 (e)(f)).
//   그 샷을 그리는 중 · 일괄 중이면 꺼진다(검토 rev-director 3번). 시안 없음 — 지금 다시 만들기 단추와 같은 크기 · 모양.
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import type { AskLumiVideoTake, FixKind } from './ask-lumi-fix'
import { useStoryboardImageGeneration } from '@/features/director/hooks/use-storyboard-image-generation'
import type { ShotNodeData } from '@/types/director'

/** 그 샷의 그림을 맡길 수 없는 때 — 그리는 중(접수 대기 포함) · 실사 일괄 중(검토 rev-director 3번). */
export function imageFixBusy(generation: { generating: boolean; batchBusy: boolean }, data: Pick<ShotNodeData, 'storyboardImage'>): boolean {
  return generation.generating || generation.batchBusy || data.storyboardImage?.status === 'pending'
}

export function AskLumiButton({ shotNodeId, kind, change, closeDetail, onSent, take, data, busy: busyProp, blocked, prepareTake }: {
  shotNodeId: string
  kind: FixKind
  change: string
  /** 그림 고치기: 그 샷 — 그리는 중 · 실사 일괄 중이면 단추를 끈다(검토 rev-director 3번, 보낸 그림 고치기가 맡겨지지 않는다). */
  data?: ShotNodeData
  /** 꺼짐을 직접 정할 때(없으면 data 로 판정). */
  busy?: boolean
  /** 영상 고치기: 고른 모델 · 해상도 · 방식 · 보던 Take — 채팅 부탁에 맡긴다(검토 rev-director 2번 · 오너 2026-11-27 N4a). */
  take?: AskLumiVideoTake
  /** 단추만 끈다(아래 안내 글은 그대로) — 영상 고치기에서 고른 방식을 지금 쓸 수 없을 때(N4a). 까닭은 부른 쪽이 보인다. */
  blocked?: boolean
  /** 보내기 직전에 맡길 설정을 더 채운다 — 이어서면 앞 영상 마지막 장면을 잡아 출처로(N4a). null 이면 보내지 않는다(까닭은 부른 쪽이 보인다). */
  prepareTake?: () => Promise<Partial<AskLumiVideoTake> | null>
  /** 스토리보드 보기 팝업이면 보낸 뒤 닫는다(채팅의 [적용]이 보이게). */
  closeDetail: boolean
  /** 보냈으면 칸을 비운다. */
  onSent?: () => void
}) {
  const t = useT()
  const [notice, setNotice] = useState<string | null>(null)
  const generation = useStoryboardImageGeneration(kind === 'image' ? data ?? null : null)
  const busy = busyProp ?? (kind === 'image' && !!data && imageFixBusy(generation, data))
  return (
    <div className="space-y-1">
      <Button type="button" size="sm" className="gap-1.5" disabled={busy || blocked} onClick={async () => {
        // 채팅 상점은 누를 때 불러온다 — 상세 화면을 불러오는 것만으로 채팅 상점 전체를 끌어오지 않게.
        const { askLumiToFix } = await import('./ask-lumi-fix')
        const extra = take && prepareTake ? await prepareTake() : {}
        if (extra === null) return
        const result = askLumiToFix({ shotNodeId, kind, change, closeDetail, ...(take ? { take: { ...take, ...extra } } : {}) })
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
      <p className="text-caption text-subtle-foreground">
        {busy
          ? t('This shot is being drawn. You can change it when it is done.')
          : kind === 'image'
            ? t('Lumi remakes the image from the current one, changing only this. No Takes used.')
            : t('Lumi makes a new Take with this change. Say yes in the chat to start.')}
      </p>
      {notice ? <p className="text-caption text-destructive">{notice}</p> : null}
    </div>
  )
}
