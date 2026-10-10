// 새 프로젝트 "무엇을 만들까요"(2026-10-02 오너 — tale-proto-v04 0.1.1). 페르소나가 아니라 만들 것을 묻고,
//   고른 것이 Producer 포맷 초안(화면 비율 · 러닝타임 · 장르)이 된다. Producer 에서 언제든 바꿀 수 있다.
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'
import type { ProjectFormat, ProjectSettings } from '@/types/project'

export type ProjectPurposeId = 'short_film' | 'drama_pilot' | 'ad' | 'adaptation' | 'music_video' | 'custom'

export interface ProjectPurpose {
  id: ProjectPurposeId
  /** 영어 원문 = 사전 키. */
  label: string
  description: string
  format: ProjectFormat
  /** 초 단위 목표 러닝타임. */
  playtime: number
  /** 영어 원문 = 사전 키. 저장할 때 프로젝트 언어로 옮긴다. */
  genre: string
}

// 시안 v04 의 WHAT 표 그대로(비율 · 러닝타임 · 장르).
export const PROJECT_PURPOSES: readonly ProjectPurpose[] = [
  { id: 'short_film', label: 'Short film', description: 'One story in 5 to 20 minutes', format: 'horizontal_16:9', playtime: 300, genre: 'Drama' },
  { id: 'drama_pilot', label: 'Drama pilot', description: 'The first episode of a series', format: 'horizontal_16:9', playtime: 720, genre: 'Drama' },
  { id: 'ad', label: 'Ad or brand', description: 'A 15 to 60 second promo video', format: 'vertical_9:16', playtime: 30, genre: 'Commercial' },
  { id: 'adaptation', label: 'Adaptation', description: 'A webtoon or novel turned into video', format: 'cinema_2.39:1', playtime: 300, genre: 'Fantasy' },
  { id: 'music_video', label: 'Music video', description: 'A video that fits the song length', format: 'horizontal_16:9', playtime: 180, genre: 'Music video' },
  { id: 'custom', label: "I'll describe it", description: 'Something not listed here', format: 'horizontal_16:9', playtime: 60, genre: 'Drama' },
]

export function projectPurpose(id: string | null | undefined): ProjectPurpose | null {
  return PROJECT_PURPOSES.find((purpose) => purpose.id === id) ?? null
}

/** 고른 것 → Producer 설정 초안. 대사 언어는 프로젝트 언어로 미리 채운다(시안 "대사 한국어 · 자동"). */
export function purposeSettings(id: ProjectPurposeId, locale: AppLocale): ProjectSettings & { purpose: ProjectPurposeId } {
  const purpose = projectPurpose(id) ?? PROJECT_PURPOSES[0]
  return {
    playtime: purpose.playtime,
    genre: translate(locale, purpose.genre),
    format: purpose.format,
    tone: [],
    dialogueLanguage: locale,
    purpose: purpose.id,
  }
}

/** 원작을 그대로 쓸 때의 설정 초안(2026-10-09 오너) — 만들 것 카드를 거치지 않는다. 길이는 원작 길이대로라 비우고(0),
 *  장르는 채팅이 원작을 읽고 채우도록 비운다(아무 장르나 넣어 두면 채팅이 그 값을 그대로 둔다). */
export function originalSettings(format: ProjectFormat, locale: AppLocale): ProjectSettings {
  return { playtime: 0, genre: '', format, tone: [], dialogueLanguage: locale }
}
