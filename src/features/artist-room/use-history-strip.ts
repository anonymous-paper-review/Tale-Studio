'use client'

// Artist 지난 그림 줄의 작은 카드(오너 2026-11-26 A4) — 인물 · 배경 · 소품 카드가 같이 쓴다(줄 부품은 components/version-history).
//   칸에 남은 그림 중 카드에 보이는 그림을 뺀 것을 가장 새 것부터 5개까지(lib/version-history pastCandidates · historyStrip).
//   Artist 칸에는 판 번호가 없어 이름은 그린 때("3시간 전")다. 다른 작품 스타일 판에서 그린 그림은 흐리게 보이고 마우스를 올리면
//   어느 판 · 스타일인지 보인다 — 상세 기록(시계)의 [불러오기]가 꺼지는 것과 같은 판정 · 같은 말(useHistoryStyle).
//   약속: tests/artist/history-strip.test.ts
import { useT } from '@/lib/i18n'
import { relativeTime } from '@/lib/i18n/relative-time'
import { historyStrip, pastCandidates } from '@/lib/version-history'
import type { VersionStripCard } from '@/components/version-history/version-history-hover'
import { useHistoryStyle } from './use-history-style'

export function useArtistHistoryStrip(
  candidates: ReadonlyArray<{ id: string; url: string; isSelected: boolean; generatedAt: string }> | null | undefined,
  shownUrl: string | null | undefined,
): { cards: VersionStripCard[]; more: number } {
  const t = useT()
  const style = useHistoryStyle()
  const strip = historyStrip(pastCandidates(candidates, shownUrl))
  return {
    cards: strip.shown.map((candidate) => {
      const state = style.describe?.(candidate) ?? null
      return { id: candidate.id, label: relativeTime(candidate.generatedAt, t), thumbUrl: candidate.url, note: state?.note ?? null, dimmed: !!state?.disabled }
    }),
    more: strip.more,
  }
}
