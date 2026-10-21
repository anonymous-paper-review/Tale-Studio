// 스타일 이름을 화면 언어로(2026-10-21 오너 "영어 언어라도 스타일 템플릿에서 이름이 한글로 나옴").
//   DB(style_anchors.label)에는 한국어 이름 하나뿐이다. 한국어 화면은 그 이름 그대로, 영어 화면은
//   아래 이름표 → DB 부제(실사 하위 스타일 6종은 영어 이름이 부제에 있다) → DB 이름 순으로 고른다.
//   직접 올린 스타일(custom_style_anchor)은 이 함수를 거치지 않는다 — 올린 사람이 붙인 이름 그대로.
//   약속: tests/artist/style-name.test.ts
import type { AppLocale } from '@/lib/locale'

const ENGLISH_NAMES: Readonly<Record<string, string>> = {
  real: 'Live Action',
  real_3d: '3D Animation',
  jp_anime: '2D Japanese Anime',
  us_cartoon: 'American Cartoon',
  stop_motion: 'Stop Motion',
  watercolor: 'Watercolor',
}

/** 채팅에 주는 스타일 목록 한 줄 — 키 · 한국어 이름 · 영어 이름 · 매체(채팅이 어느 언어로 답해도 그 언어 이름을 쓰게, 10/21 검토). */
export function styleCatalogLine(anchor: { key: string; label: string; subtitle?: string | null; medium?: string | null }): string {
  return `${anchor.key} | ${anchor.label} | ${styleAnchorName(anchor, 'en')} | medium:${anchor.medium ?? '?'}`
}

export function styleAnchorName(anchor: { key: string; label: string; subtitle?: string | null }, locale: AppLocale): string {
  if (locale === 'ko') return anchor.label
  return ENGLISH_NAMES[anchor.key] ?? (anchor.subtitle?.trim() || anchor.label)
}
