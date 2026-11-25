'use client'

// 채팅 입력창 바로 위 "내 자리" 한 줄 (2026-11-25) — 예전 개발용 토큰 줄(ChatTraceFooter)이 있던 자리.
//
// 역할 나누기: 바로 위 진행 알림바(chat-progress-pin)는 "지금 무엇을 그리는지"를 도는 동안만 보이고,
//   이 줄은 "내 자리가 몇 개 남았는지"를 늘 보인다.
// 숫자의 출처는 제출을 막는 쪽과 **같은 집계**다 — generation-quota.userSlotUsage(최근 30분 queued ·
//   영상/그림 종류군 · 예외표 상한)를 /api/generation/active 가 실어 보내고 단일 폴러가 나눠 준다.
//   화면이 다른 수를 세면 "자리가 남았는데 429" 또는 "꽉 찼는데 눌러도 된다"로 엇갈린다.

import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useGenerationSlots } from '@/lib/generation-queue'

/** 그 자리를 다 썼나 — 상한이 없으면(관리자) 영원히 아니다. */
function isFull(slot: { used: number; limit: number | null }): boolean {
  return slot.limit != null && slot.used >= slot.limit
}

export function ChatSlotLine({ projectId }: { projectId: string | null }) {
  const t = useT()
  const slots = useGenerationSlots(projectId)
  // 아직 받지 못했으면 그리지 않는다 — "0 / 6"을 먼저 보이면 그리는 중인 자리를 비었다고 잘못 읽는다.
  if (!slots) return null

  const { image, video } = slots
  const imageText =
    image.limit == null
      ? t('Images {used} · no limit', { used: image.used })
      : t('Images {used} / {limit}', { used: image.used, limit: image.limit })
  const videoText =
    video.limit == null
      ? t('Videos {used} · no limit', { used: video.used })
      : t('Videos {used} / {limit}', { used: video.used, limit: video.limit })

  return (
    <p className="shrink-0 border-t border-border-subtle px-5 py-1.5 font-num text-[10px] text-subtle-foreground">
      {/* 꽉 찬 자리만 경고색 — 누르기 전에 "지금은 안 된다"를 색으로 먼저 본다. */}
      <span className={cn(isFull(image) && 'text-warning')}>{imageText}</span>
      {' · '}
      <span className={cn(isFull(video) && 'text-warning')}>{videoText}</span>
    </p>
  )
}
