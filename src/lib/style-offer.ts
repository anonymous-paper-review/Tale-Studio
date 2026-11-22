// 고를 수 있는 그림체 네 가지와, 없어진 그림체의 가장 가까운 짝 (D6 오너 2026-11-22 "4종만 놔두고 다른 선택지를 아예 없애줘.
//   영상 품질 관리를 하기가 너무 어려워서 … 숨긴 스타일은 가장 가까운 4종 중 하나를 제안해줘").
//   스타일 목록(이름 · 예시 그림 · 순서 · 그림체 글)은 DB(style_anchors)가 그대로 정본이다 — DB 는 바꾸지 않고, 고르는 자리만 여기서 거른다.
//   이미 없어진 스타일로 그린 작품은 그 스타일로 계속 그린다(생성 resolveStyleAnchor 는 그대로 — 리드 2026-11-22 안 1 바탕).
//   스토어의 스타일 목록은 전체를 이름표로 둔다 — 버전 · 카드 기록의 스타일 이름이 키로 보이지 않게.
//   순수 모듈(서버 전용 모듈을 들이지 않는다) — 화면 · 서버 · 시험이 같이 쓴다. 약속: tests/artist/style-offer.test.ts
import { styleAnchorName } from '@/lib/style-anchor-name'

/** 고를 수 있는 네 가지 — 실사 · 2D 일본 애니 · 수채 · 스톱모션. 보이는 순서는 카탈로그(sort_order) 순서. */
export const OFFERED_STYLE_KEYS = ['real', 'jp_anime', 'watercolor', 'stop_motion'] as const
export type OfferedStyleKey = (typeof OFFERED_STYLE_KEYS)[number]

/** 없어진 스타일 → 가장 가까운 네 가지 중 하나(혼자 정한 것 — 개발 DB 그림체 캡슐 비교: 3D 와 스톱모션은 선 없이 이어지는 음영 ·
 *  접촉 그림자 · 섬유 질감, 미국 카툰과 2D 일본 애니는 외곽선 · 딱딱한 그림자의 2D, 실사 변형 여섯은 매체가 실사). */
const NEAREST_BY_KEY: Readonly<Record<string, OfferedStyleKey>> = {
  real_3d: 'stop_motion',
  us_cartoon: 'jp_anime',
  real_jp_melo: 'real',
  real_psy_horror: 'real',
  real_hitech_sf: 'real',
  real_desert_fantasy: 'real',
  real_urban_hero: 'real',
  real_euro_period: 'real',
}

/** 매체로 정하는 짝 — 이미 올린 그림체(저장된 매체)와 표에 없는 키. 그림을 다시 보지 않는다(결정 2: 그림을 보고 권하지 않는다). */
const NEAREST_BY_MEDIUM: Readonly<Record<string, OfferedStyleKey>> = {
  live_action: 'real',
  '2d_anime': 'jp_anime',
  '2d_cartoon': 'jp_anime',
  '3d': 'stop_motion',
  stop_motion: 'stop_motion',
  watercolor: 'watercolor',
}

export function isOfferedStyle(key: string | null | undefined): key is OfferedStyleKey {
  return !!key && (OFFERED_STYLE_KEYS as readonly string[]).includes(key)
}

/** 고르는 자리에 보일 스타일 — 카탈로그 순서 그대로 네 가지만. */
export function offeredStyles<T extends { key: string }>(anchors: readonly T[]): T[] {
  return anchors.filter((anchor) => isOfferedStyle(anchor.key))
}

/** 가장 가까운 네 가지 중 하나 — 네 가지 안이면 자기 자신, 없어진 스타일은 표, 그 밖은 매체로. 모르면 null(네 가지 이름만 안내). */
export function nearestOfferedStyle(input: { key?: string | null; medium?: string | null }): OfferedStyleKey | null {
  if (isOfferedStyle(input.key)) return input.key
  if (input.key && NEAREST_BY_KEY[input.key]) return NEAREST_BY_KEY[input.key]
  return (input.medium && NEAREST_BY_MEDIUM[input.medium]) || null
}

type CatalogEntry = { key: string; label: string; subtitle?: string | null; medium?: string | null }

/**
 * 채팅 모델에게 주는 없어진 스타일 표 — [Retired Styles] 줄마다 이름(한국어 | 영어)과 가장 가까운 키. 없어진 것이 없으면 null.
 *   모델은 [Style Anchor Catalog](네 가지)의 키만 정할 수 있고, 여기 있는 스타일을 말하면 정하지 않고 가장 가까운 것을 권한다
 *   (시스템 프롬프트 style_anchor_by_name).
 */
export function retiredStylesContext(catalog: readonly CatalogEntry[]): string | null {
  const lines = catalog.flatMap((entry) => {
    if (isOfferedStyle(entry.key)) return []
    const nearest = nearestOfferedStyle({ key: entry.key, medium: entry.medium ?? null })
    return nearest ? [`${entry.label} | ${styleAnchorName(entry, 'en')} -> closest: ${nearest}`] : []
  })
  return lines.length ? `[Retired Styles]\n${lines.join('\n')}` : null
}

// ── 채팅에서 없어진 스타일 이름 알아보기(D6) ──────────────────────────────
//   없어진 이름은 스타일 낱말과 함께 있을 때만 알아본다 — 실사 변형 이름(심리 공포 · 일본 멜로 …)은 장르 말과 겹쳐, 이름만 보고 답하면
//   "심리 공포처럼 더 무섭게" 같은 산문 고침을 가로챈다. Writer 채팅(visualOnly)에서는 그 이름들에 그림 낱말(그림체 · 화풍 · 룩 …)이 있어야 한다 —
//   "심리 공포 스타일로 다시 써줘"는 글을 그 결로 고쳐 달라는 말일 수 있다. 약속: tests/chat/retired-style-name.test.ts

/** 그림 모양을 말하는 낱말. */
const VISUAL_WORDS = ['그림체', '화풍', '룩', '비주얼', 'art style', 'look', 'visual'] // i18n-ok: 알아들을 낱말 목록 자체
/** 그림 · 글 어느 쪽에도 쓰는 낱말. */
const STYLE_WORDS = ['스타일', 'style'] // i18n-ok: 알아들을 낱말 목록 자체
/** 사용자가 줄여 부르는 이름. */
const SHORT_NAMES: Readonly<Record<string, readonly string[]>> = {
  real_3d: ['3D'],
  us_cartoon: ['카툰', 'cartoon'], // i18n-ok: 알아들을 이름 목록 자체
}

/** 비교용 — 소문자로, 빈칸 · 문장부호를 걷는다("3D 애니메이션" = "3d애니메이션"). */
const squash = (text: string) => text.toLowerCase().replace(/[\s·・.,!?'"“”‘’()[\]{}\-_/]+/g, '')

/** 이 말에 스타일 낱말이 있는가 — 없으면 카탈로그를 읽을 일도 없다. */
export function mentionsStyleWord(text: string): boolean {
  const flat = squash(text)
  return [...VISUAL_WORDS, ...STYLE_WORDS].some((word) => flat.includes(squash(word)))
}

/**
 * 채팅 말에서 부른 없어진 스타일의 키 — 스타일 낱말이 없거나, 네 가지 이름도 함께 있거나, 없어진 이름이 없으면 null.
 *   이름 = 한국어 이름(DB) · 영어 이름 · 부제 · 짧은 이름. 둘 이상이면 말에서 먼저 나온 것.
 *   visualOnly(Writer 채팅): 실사 변형(매체 live_action)은 그림 낱말이 있을 때만 본다.
 */
export function retiredStyleMention(text: string, catalog: readonly CatalogEntry[], opts: { visualOnly: boolean }): string | null {
  const flat = squash(text)
  const has = (words: readonly string[]) => words.some((word) => flat.includes(squash(word)))
  const visual = has(VISUAL_WORDS)
  if (!visual && !has(STYLE_WORDS)) return null
  const names = (entry: CatalogEntry) =>
    [entry.label, styleAnchorName(entry, 'en'), entry.subtitle ?? '', ...(SHORT_NAMES[entry.key] ?? [])].map(squash).filter(Boolean)
  // 네 가지 중 하나를 함께 말했으면 고른 말이다("3D 애니메이션 말고 수채 그림체로") — 지금처럼 보낸다.
  if (catalog.some((entry) => isOfferedStyle(entry.key) && names(entry).some((name) => flat.includes(name)))) return null
  let found: { key: string; at: number } | null = null
  for (const entry of catalog) {
    if (isOfferedStyle(entry.key)) continue
    if (opts.visualOnly && entry.medium === 'live_action' && !visual) continue
    for (const name of names(entry)) {
      const at = flat.indexOf(name)
      if (at >= 0 && (!found || at < found.at)) found = { key: entry.key, at }
    }
  }
  return found?.key ?? null
}
