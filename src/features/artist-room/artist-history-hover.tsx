'use client'

// Artist 카드의 지난 그림 줄(오너 2026-11-26 A4) — 인물 · 배경 · 소품 카드를 세 탭 공용 지난 판 줄(components/version-history)로 감싼다.
//   카드마다 부르는 부품이라 줄 계산(useArtistHistoryStrip — 훅)을 여기서 한다. 그림은 세 카드 모두 16:9 한 장(시트 · 배경 · 소품 양식).
//   누르면 onOpen(후보 id) — 카드가 상세를 그 그림으로 연다. "+N" 은 onMore — 지난 그림 없이 상세(모든 그림은 상세 기록에).
//   약속: tests/artist/history-cards.test.ts
import type { ReactNode } from 'react'
import { VersionHistoryHover } from '@/components/version-history/version-history-hover'
import { useArtistHistoryStrip } from './use-history-strip'

export function ArtistHistoryHover({ candidates, shownUrl, onOpen, onMore, children }: {
  candidates: ReadonlyArray<{ id: string; url: string; isSelected: boolean; generatedAt: string }> | null | undefined
  /** 카드에 보이는 그림 — 지난 판이 아니다. */
  shownUrl: string | null | undefined
  onOpen: (candidateId: string) => void
  onMore: () => void
  children: ReactNode
}) {
  const strip = useArtistHistoryStrip(candidates, shownUrl)
  return (
    <VersionHistoryHover cards={strip.cards} more={strip.more} aspect="16 / 9" onOpen={onOpen} onMore={onMore}>
      {children}
    </VersionHistoryHover>
  )
}
