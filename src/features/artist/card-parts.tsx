'use client'

// Artist 카드 묶음 조각(v3 A5, 오너 2026-11-03) — 인물 · 배경 카드가 같이 쓴다.
//   판 배지: 카드 그림 오른쪽 아래 "v1"(그 그림을 그린 때의 작품 스타일 버전, lib/artist/style-versions cardVersion).
//   모습 칩: 카드 안에서 모습을 고르는 작은 알약(고른 것은 지금 단계 색 테두리 · 18% 바탕 — ChoiceChip 과 같은 규칙).
//   다시 그리기 표시(11/5 시안 AR): 작품 스타일을 다시 그리는 동안 카드 그림 위에 새로 그렸어요 · 그리는 중 · 순서 기다리는 중.
import { Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { cardVersion, regenCardMark, type RegenCardMarkState, type RegenSlot } from '@/lib/artist/style-versions'
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

/** 카드가 보이는 칸의 다시 그리기 표시를 정하는 함수 — 재생성 진행을 읽어 둔다(카드마다 부르는 함수라 훅은 여기서 한 번). */
export function useRegenCardMarks(): (slot: Pick<RegenSlot, 'kind' | 'id' | 'appearanceKey'>) => RegenCardMarkState | null {
  const regen = useArtistVersionStore((s) => s.regen)
  const stopped = useArtistVersionStore((s) => s.run.stopped)
  return (slot) => regenCardMark({ regen, stopped }, slot)
}

/** 카드 그림 위 다시 그리기 표시 — 다 그린 칸은 옅게, 그리는 · 기다리는 칸은 짙게 덮는다(시안 30% · 62%).
 *  칸 안 진행 막대는 진짜 진행률이 없어 두지 않고, 그리는 칸은 도는 표시만 둔다(리드 2026-11-09). */
export function RegenCardMark({ mark }: { mark: RegenCardMarkState | null }) {
  const t = useT()
  if (!mark) return null
  return (
    <span
      className={cn(
        'pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[14px] text-center',
        mark === 'new' ? 'bg-on-stage/30' : 'bg-on-stage/60',
      )}
      data-testid="artist-regen-mark"
      data-mark={mark}
    >
      {mark === 'new' ? (
        <span className="text-xs font-semibold text-foreground"><span aria-hidden>✓ </span>{t('Redrawn')}</span>
      ) : mark === 'drawing' ? (
        <>
          <Loader2 className="size-4 animate-spin text-foreground motion-reduce:animate-none" aria-hidden />
          <span className="text-[12.5px] font-semibold text-foreground">{t('Drawing…')}</span>
        </>
      ) : (
        <span className="text-xs font-medium text-subtle-foreground">{t('Waiting for its turn')}</span>
      )}
    </span>
  )
}
