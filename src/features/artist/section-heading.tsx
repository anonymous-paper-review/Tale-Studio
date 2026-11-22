'use client'

// Artist 한 페이지의 묶음 머리(D13, 2026-11-22) — "인물 3" 처럼 이름과 카드 수, 카드가 없으면 왜 없는지 한 줄.
//   자료를 다 읽기 전(loading)에는 숫자 · 안내 대신 이름과 "불러오는 중…"(실제 프로젝트 QA a, 2026-11-23).
//   이름 · 수는 위 바로가기 단추와 같은 말이다(단추가 가리키는 곳이 어디인지 알게). 약속: tests/artist/section-jump.test.ts
import { Loader2 } from 'lucide-react'
import { useT } from '@/lib/i18n'
import type { ArtistSection } from '@/lib/artist/card-filter'
import { propEmptyLine } from '@/lib/artist/prop-source'

export const SECTION_LABEL: Record<ArtistSection, string> = {
  characters: 'Characters {count}',
  world: 'Backgrounds {count}',
  props: 'Props {count}',
}

// 소품 한 줄은 소품 출처(prop-source.ts)를 따른다 — 출처가 바뀌면 그 출처의 말로.
const EMPTY_LINE: Record<ArtistSection, string> = {
  characters: 'No characters yet. Characters come from the confirmed prose.',
  world: 'No backgrounds yet. Backgrounds come from the confirmed prose.',
  props: propEmptyLine(),
}

/** 숫자 없는 묶음 이름 — 같은 사전 줄에서 숫자 자리만 비운다("인물 {count}" → "인물"). */
export function sectionName(t: (text: string, params?: Record<string, string | number>) => string, section: ArtistSection): string {
  return t(SECTION_LABEL[section], { count: '' }).trim()
}

export function ArtistSectionHeading({ section, count, loading = false }: { section: ArtistSection; count: number; loading?: boolean }) {
  const t = useT()
  if (loading) {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="text-body font-semibold" data-testid={`artist-section-title-${section}`}>{sectionName(t, section)}</h2>
        <p className="inline-flex items-center gap-1.5 text-caption text-muted-foreground" role="status" data-testid={`artist-section-loading-${section}`}>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t('Loading…')}
        </p>
      </div>
    )
  }
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
