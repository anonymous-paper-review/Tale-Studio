'use client'

// Artist 카드 묶음 조각(v3 A5, 오너 2026-11-03) — 인물 · 배경 카드가 같이 쓴다.
//   판 배지: 카드 그림 오른쪽 아래 "v1"(그 그림을 그린 때의 작품 스타일 버전, lib/artist/style-versions cardVersion).
//   모습 칩: 카드 안에서 모습을 고르는 작은 알약(고른 것은 지금 단계 색 테두리 · 18% 바탕 — ChoiceChip 과 같은 규칙).
import { cn } from '@/lib/utils'
import { cardVersion } from '@/lib/artist/style-versions'
import { useArtistVersionStore } from '@/stores/artist-version-store'

/** 그림의 판 배지를 정하는 함수 — 작품 스타일 기록을 읽어 둔다. */
export function useCardVersion(): (imageUrl: string | null | undefined, candidates?: readonly { url: string; isSelected: boolean; generatedAt: string }[]) => number | null {
  const versions = useArtistVersionStore((s) => s.versions)
  return (imageUrl, candidates) => cardVersion({ imageUrl, candidates, versions })
}

/** 카드 그림 위 판 배지(v1 · v2 …). 그림이 없으면 그리지 않는다. */
export function VersionBadge({ n }: { n: number | null }) {
  if (n === null) return null
  return (
    <span
      className="pointer-events-none absolute bottom-2 right-2 rounded-[6px] bg-black/45 px-1.5 py-px font-num text-micro font-semibold text-white"
      data-testid="artist-card-version"
    >
      {`v${n}`}
    </span>
  )
}

/** 모습 칩 모양 — 고른 칩은 단계 색. */
export function lookChipClass(active: boolean): string {
  return cn(
    'inline-flex h-7 items-center rounded-full border-[1.5px] px-2.5 text-caption font-medium transition-colors duration-100 ease-out',
    active ? 'border-stage bg-stage/18 text-foreground' : 'border-transparent bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
  )
}
