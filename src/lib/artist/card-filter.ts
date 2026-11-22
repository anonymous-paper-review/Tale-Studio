// Artist 묶음(D13, 오너 2026-11-22 "인물, 배경, 소품을 한 페이지에 다 담아주고 버튼을 누르면 그 섹션으로 바로 이동") —
//   예전 걸러 보기(v3 A5 모두 · 인물 · 배경, 2026-11-03)를 바꿨다. 묶음은 늘 함께 보이고, 위의 단추는 그 묶음으로 가는 바로가기다.
//   마지막에 간 묶음은 artist-store 의 uiTab 이 기억한다(약속 D15). 묶음은 늘 그려져 있어 카드의 채팅 대상 · 고른 모습이 남는다(검토 A M1).
//   약속: tests/artist/card-filter.test.ts · tests/artist/section-jump.test.ts
export const ARTIST_SECTIONS = ['characters', 'world', 'props'] as const
export type ArtistSection = (typeof ARTIST_SECTIONS)[number]

/** 묶음 머리 자리의 문서 id — 바로가기 단추가 이 자리로 스크롤한다. */
export function artistSectionId(section: ArtistSection): string {
  return `artist-section-${section}`
}

/** 묶음마다 카드 수 — 단추 숫자 · 묶음 머리 숫자(보관 카드 포함). */
/**
 * 아직 이 프로젝트의 Artist 자료를 다 읽지 않았는가 — 그 동안은 묶음 머리 · 바로가기 단추 · 머리 줄에 숫자 0 과 "아직 ~이 없어요" 대신
 *   불러오는 중을 보인다(실제 프로젝트 QA a, 2026-11-23). 카드가 하나라도 있으면(다른 길로 먼저 실렸으면) 숫자를 그대로 보인다.
 */
export function artistDataLoading(input: { projectId: string | null; loadedProjectId: string | null; counts: Record<ArtistSection, number> }): boolean {
  const total = ARTIST_SECTIONS.reduce((sum, section) => sum + (input.counts[section] ?? 0), 0)
  return total === 0 && (!input.projectId || input.loadedProjectId !== input.projectId)
}

export function artistSectionCounts(input: { characters: number; worlds: number; props: number }): Record<ArtistSection, number> {
  return { characters: input.characters, world: input.worlds, props: input.props }
}

/** 바로가기 움직임 — 움직임 줄이기 설정이면 미끄러지지 않고 바로 간다. */
export function artistJumpBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth'
}

/** 단추 → 그 묶음 머리로 스크롤한다(머리 위 여백은 묶음의 scroll-margin 이 맡는다). 자리를 못 찾으면 false. */
export function jumpToArtistSection(
  section: ArtistSection,
  deps: { getElement: (id: string) => { scrollIntoView: (options: ScrollIntoViewOptions) => void } | null; reducedMotion: boolean },
): boolean {
  const element = deps.getElement(artistSectionId(section))
  if (!element) return false
  element.scrollIntoView({ behavior: artistJumpBehavior(deps.reducedMotion), block: 'start' })
  return true
}

/**
 * 지금 보는 묶음 — 붙어 있는 단추 줄 바로 아래(scrollTop + offset)에 머리가 닿은 마지막 묶음.
 *   맨 아래까지 내렸으면 마지막 묶음이다(짧은 마지막 묶음은 머리가 위쪽까지 올라오지 못한다). 자리를 모르면 첫 묶음.
 *   top 은 스크롤 칸 안의 좌표(맨 위 = 0)다.
 */
export function activeArtistSection(
  tops: ReadonlyArray<{ section: ArtistSection; top: number }>,
  view: { scrollTop: number; clientHeight: number; scrollHeight: number; offset: number },
): ArtistSection {
  if (tops.length === 0) return ARTIST_SECTIONS[0]
  const ordered = [...tops].sort((a, b) => a.top - b.top)
  if (view.scrollTop + view.clientHeight >= view.scrollHeight - 1) return ordered[ordered.length - 1].section
  const line = view.scrollTop + view.offset
  let current = ordered[0].section
  for (const entry of ordered) if (entry.top <= line) current = entry.section
  return current
}

/** 켜 둘 단추 — 누른 묶음(pinned)이 있으면 그것, 없으면 잰 묶음. 짧은 페이지에서 누른 묶음이 "맨 아래" 규칙에 밀리지 않게 한다. */
export function shownArtistSection(pinned: ArtistSection | null, measured: ArtistSection): ArtistSection {
  return pinned ?? measured
}

/** 사람이 판을 직접 스크롤하는 키인가 — 이 키를 누르면 누른 단추 고정을 푼다. 좌우 화살표(Alt+←/→ 묶음 이동)는 스크롤이 아니다. */
export function keyScrollsArtistBoard(key: string): boolean {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'PageDown' || key === 'PageUp' || key === 'Home' || key === 'End' || key === ' '
}
