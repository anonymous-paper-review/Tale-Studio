'use client'

// Artist 한 페이지의 묶음 머리(D13, 2026-11-22) — "인물 3" 처럼 이름과 카드 수, 카드가 없으면 왜 없는지 한 줄.
//   이름 · 수는 위 바로가기 단추와 같은 말이다(단추가 가리키는 곳이 어디인지 알게). 약속: tests/artist/section-jump.test.ts
import { useT } from '@/lib/i18n'
import type { ArtistSection } from '@/lib/artist/card-filter'

export const SECTION_LABEL: Record<ArtistSection, string> = {
  characters: 'Characters {count}',
  world: 'Backgrounds {count}',
  props: 'Props {count}',
}

const EMPTY_LINE: Record<ArtistSection, string> = {
  characters: 'No characters yet. Characters come from the confirmed prose.',
  world: 'No backgrounds yet. Backgrounds come from the confirmed prose.',
  props: 'No props yet. Objects you set in Producer become props.',
}

export function ArtistSectionHeading({ section, count }: { section: ArtistSection; count: number }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-body font-semibold" data-testid={`artist-section-title-${section}`}>
        {t(SECTION_LABEL[section], { count })}
      </h2>
      {count === 0 ? (
        <p className="text-caption text-muted-foreground" data-testid={`artist-section-empty-${section}`}>
          {t(EMPTY_LINE[section])}
        </p>
      ) : null}
    </div>
  )
}
