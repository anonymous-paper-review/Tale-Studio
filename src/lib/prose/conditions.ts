// Writer 산문 조건 화면 규칙(리뉴얼 1차 2026-10-19, 프로토타입 W1 · W3).
//   산문 위 "지금 산문 · 1~5분 · 코미디 · 소재 그대로" 한 줄과 [AI 다시 쓰기 ▾] 옵션(러닝타임 · 장르·분위기 · 아이디어 소재).
//   선택지 이름은 영어 원문 = 사전 키. 장르·분위기는 Producer 시작 화면처럼 프로젝트 언어 이름으로 저장한다.
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import type { ProseConditions, ProseSeed } from '@/lib/writer/prose-conditions'

export const RUNTIME_CHOICES: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 15, label: '15 seconds or less' },
  { seconds: 60, label: '15 to 60 seconds' },
  { seconds: 300, label: '1 to 5 minutes' },
  { seconds: 1200, label: '5 to 20 minutes' },
]

export const MOOD_CHOICES: readonly string[] = [
  'Comedy',
  'Drama',
  'Romance',
  'Thriller',
  'Horror',
  'Action',
  'Sci-fi and fantasy',
  'Mystery',
  'Human and family',
  'Slice of life',
]

export const SEED_CHOICES: ReadonlyArray<{ seed: ProseSeed; label: string; detail: string }> = [
  { seed: 'keep', label: 'Keep', detail: 'Keep the current idea material' },
  { seed: 'new', label: 'New', detail: 'New material from scratch' },
]

const SEED_LINE: Record<ProseSeed, string> = { keep: 'Same idea material', new: 'New idea material' }

/** 길이 이름 — 네 구간이면 구간 이름, 아니면 초 · 분 그대로(예전 프로젝트). */
export function runtimeLabel(seconds: number, locale: AppLocale): string {
  const choice = RUNTIME_CHOICES.find((option) => option.seconds === seconds)
  if (choice) return translate(locale, choice.label)
  if (seconds >= 60 && seconds % 60 === 0) return translate(locale, '{count} min', { count: seconds / 60 })
  return translate(locale, '{count} sec', { count: seconds })
}

export function proseConditionLine(
  conditions: { runtimeSeconds: number | null; genre: string | null; seed: ProseSeed },
  locale: AppLocale,
): string {
  return [
    conditions.runtimeSeconds ? runtimeLabel(conditions.runtimeSeconds, locale) : null,
    conditions.genre?.trim() || null,
    translate(locale, SEED_LINE[conditions.seed]),
  ].filter(Boolean).join(' · ')
}

/** 옵션을 열 때 골라 둘 길이 구간 — 구간 밖 길이는 그 길이를 담는 구간으로, 모르면 15~60초. */
export function runtimeIndexOf(seconds: number | null | undefined): number {
  if (!seconds || seconds <= 0) return 1
  if (seconds <= 15) return 0
  if (seconds <= 60) return 1
  if (seconds <= 300) return 2
  return 3
}

/** 저장된 장르 이름(프로젝트 언어 또는 영어 원문)이 몇 번째 선택지인가. 없으면 -1. */
export function moodIndexOf(genre: string | null | undefined, locale: AppLocale): number {
  const name = genre?.trim()
  if (!name) return -1
  return MOOD_CHOICES.findIndex((mood) => mood === name || translate(locale, mood) === name)
}

export function conditionsFromPicks(picks: { runtime: number; mood: number; seed: ProseSeed }, locale: AppLocale): ProseConditions {
  const runtime = RUNTIME_CHOICES[picks.runtime] ?? RUNTIME_CHOICES[1]
  const mood = MOOD_CHOICES[picks.mood] ?? MOOD_CHOICES[1]
  return { runtimeSeconds: runtime.seconds, genre: translate(locale, mood), seed: picks.seed }
}

/** 산문 도구(다시 쓰기 · 직접 작성 · 브레이크다운)를 켤지. 대본 그대로 · 확정한 산문은 브레이크다운만. */
export function proseTools(input: { preserved: boolean; locked: boolean; hasProse: boolean; busy: boolean }): { rewrite: boolean; manual: boolean; breakdown: boolean } {
  if (!input.hasProse || input.busy) return { rewrite: false, manual: false, breakdown: false }
  const editable = !input.preserved && !input.locked
  return { rewrite: editable, manual: editable, breakdown: true }
}
