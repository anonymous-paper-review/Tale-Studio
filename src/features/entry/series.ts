// 시리즈 다음 화의 시작 화면 정보(2026-10-26 · 프로토타입 E3s · E4s) — 앞 화 비율 · 대사 언어 · 이어받은 개수 · 말투 · 마지막 장면.
//   시작 화면 GET(/api/produce/entry)이 projects.series 에서 만들어 돌려주고, 설정 화면 · 시작 확인 창 · 채팅 [추천대로]가 읽는다. 순수 함수.
//   그림 주소 · 성격 같은 큰 값은 싣지 않는다 — 시작 화면 띠는 시리즈 정보(/api/project/[id]/series)를 따로 읽는다.
//   약속: tests/producer/entry-series-screen.test.ts · tests/producer/entry-series.test.ts
import type { SeriesSnapshot } from '@/lib/series/snapshot'
import { parseDialogueLanguage, type DialogueLanguage } from '@/lib/writer/pipeline/util/output-language'
import type { EntryDraft, EntryPicks } from '@/lib/entry/draft'
import { MOODS, RATIOS, RECOMMENDED_RATIO, ratioFromFormat, type LevelKey, type MoodKey, type RatioKey, type RuntimeKey } from './options'

export interface EntrySeries {
  /** 앞 화 화면 비율 — 설정 화면이 기본으로 골라 두고 "앞 화" 표시를 붙인다. 읽지 못했으면 null(지금처럼 9:16 추천). */
  ratio: RatioKey | null
  /** 앞 화 대사 언어(이번 화도 잠근다). 읽지 못했으면 null — 언어 묶음 · 언어 줄을 보이지 않는다. */
  dialogueLanguage: DialogueLanguage | null
  characters: number
  locations: number
  /** 앞 화가 대사까지 끝나 말투가 넘어왔나. */
  hasVoices: boolean
  continuesLastScene: boolean
  /** 앞 화 장르 · 분위기(2026-11-09 오너 추천대로) — 시작 화면이 미리 골라 두고 "앞 화" 표시를 붙인다. 모르면 칸이 없다. */
  mood?: MoodKey
}

export function entrySeriesOf(series: SeriesSnapshot | null): EntrySeries | null {
  if (!series) return null
  return {
    ratio: ratioFromFormat(series.format),
    dialogueLanguage: series.dialogueLanguage,
    characters: series.characters.length,
    locations: series.locations.length,
    hasVoices: series.voices.length > 0,
    continuesLastScene: series.continuesLastScene,
    ...(series.mood ? { mood: series.mood } : {}),
  }
}

/** 시작 화면 GET 응답의 series 를 읽는다. 개수 · 참거짓 칸이 틀리면 시리즈가 아닌 것으로 본다. */
export function parseEntrySeries(raw: unknown): EntrySeries | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  const count = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null)
  const characters = count(v.characters)
  const locations = count(v.locations)
  if (characters === null || locations === null) return null
  if (typeof v.hasVoices !== 'boolean' || typeof v.continuesLastScene !== 'boolean') return null
  return {
    ratio: RATIOS.find((r) => r.key === v.ratio)?.key ?? null,
    dialogueLanguage: parseDialogueLanguage(v.dialogueLanguage) ?? null,
    characters,
    locations,
    hasVoices: v.hasVoices,
    continuesLastScene: v.continuesLastScene,
    ...moodOf(v.mood),
  }
}

function moodOf(raw: unknown): { mood?: MoodKey } {
  const mood = MOODS.find((m) => m.key === raw)?.key
  return mood ? { mood } : {}
}

/**
 * 장르 · 분위기의 추천 — 다음 화는 앞 화 장르("앞 화" 표시), 아니면 AI 추천(2026-11-09 오너 추천대로, 화면 비율과 같은 규칙).
 *   채팅 카드 · 설정 화면 · [추천대로]가 같은 값을 쓴다. 약속: tests/producer/entry-series-mood.test.ts
 */
export function moodRecommendation(
  series: EntrySeries | null | undefined,
  rec: { mood: MoodKey } | null | undefined,
): { value: MoodKey | null; fromPreviousEpisode: boolean } {
  if (series?.mood) return { value: series.mood, fromPreviousEpisode: true }
  return { value: rec?.mood ?? null, fromPreviousEpisode: false }
}

/**
 * 글을 읽어 추천을 만든 뒤의 고른 값 — 길이 · 바꿈 정도는 추천, 화면 비율은 지금 값(없으면 9:16).
 *   장르는 다음 화(앞 화 장르가 있는 시리즈)면 지금 고른 값(처음엔 이어받은 장르, 사람이 바꿨으면 그 값)을 지키고, 아니면 추천.
 */
export function picksAfterRecommend(
  draft: EntryDraft,
  rec: { mood: MoodKey; runtime: RuntimeKey; level: LevelKey },
  seriesMood: MoodKey | null | undefined,
): EntryPicks {
  return {
    mood: seriesMood && draft.picks.mood ? draft.picks.mood : rec.mood,
    runtime: rec.runtime,
    level: rec.level,
    ratio: draft.picks.ratio ?? RECOMMENDED_RATIO,
  }
}

/** 화면 비율 기본값 — 시리즈 다음 화는 앞 화 비율, 아니면 9:16 추천. */
export function ratioRecommendation(series: EntrySeries | null | undefined): RatioKey {
  return series?.ratio ?? RECOMMENDED_RATIO
}

// 언어 이름은 각 언어의 자국어 표기 — 화면 언어와 무관하게 고정(quest-journal LANGUAGE_OPTIONS 와 같다).
const LANGUAGE_NAME: Record<DialogueLanguage, string> = {
  ko: '한국어', // i18n-ok: 언어 자국어 표기(endonym), 번역 대상 아님
  en: 'English',
  ja: '日本語', // i18n-ok: 언어 자국어 표기(endonym), 번역 대상 아님
  zh: '中文', // i18n-ok: 언어 자국어 표기(endonym), 번역 대상 아님
}

export function dialogueLanguageName(lang: DialogueLanguage): string {
  return LANGUAGE_NAME[lang]
}
