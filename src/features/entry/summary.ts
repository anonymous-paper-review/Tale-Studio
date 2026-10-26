// 정한 값 한 장(리뉴얼 1차 2026-10-19) — 1안 시작 확인 창(E4) · 2안 정리 카드(EB7) · 시작한 뒤 완료 화면이 같은 줄을 쓴다.
//   시리즈 다음 화(2026-10-26 · 프로토타입 E4s)는 잠근 언어 · 이어받는 것 · 첫 샷 줄을 더한다.
//   약속: tests/producer/entry-screens.test.ts · tests/producer/entry-series-screen.test.ts
import { fileHasText, type EntryDraft } from '@/lib/entry/draft'
import type { AppLocale } from '@/lib/locale'
import { QUESTION_NAME, moodOf, runtimeOf } from './options'
import { levelOptionsOf, type Translator } from './chat-flow'
import { dialogueLanguageName, type EntrySeries } from './series'

export type SummaryRowKey = 'ratio' | 'mood' | 'runtime' | 'level' | 'material' | 'language' | 'carried' | 'firstShot'

export interface SummaryRow {
  key: SummaryRowKey
  label: string
  value: string
  /** 화면 비율 · 시리즈 다음 화의 언어 — 시작하면 끝까지 잠긴다. */
  locked?: boolean
}

export const RATIO_LOCK_NOTE = 'It cannot be changed after you start'

/**
 * 확인 창 · 정리 카드(mode confirm)는 "시작하면 끝까지 바꿀 수 없어요"를 비율 옆에 붙이고,
 * 완료 화면(mode done)은 비율만 적는다(잠김 표시는 화면이 붙인다). 정하지 않은 값의 줄은 뺀다(예전 프로젝트).
 */
export function summaryRows(
  draft: EntryDraft,
  opts: { t: Translator; locale: AppLocale; mode?: 'confirm' | 'done'; series?: EntrySeries | null },
): SummaryRow[] {
  const { t } = opts
  const mode = opts.mode ?? 'confirm'
  const { mood, runtime, level, ratio } = draft.picks
  const rows: SummaryRow[] = []
  if (ratio) rows.push({ key: 'ratio', label: t(QUESTION_NAME.ratio), value: mode === 'confirm' ? `${ratio} · ${t(RATIO_LOCK_NOTE)}` : ratio, locked: true })
  if (mood) rows.push({ key: 'mood', label: t(QUESTION_NAME.mood), value: t(moodOf(mood).label) })
  if (runtime) rows.push({ key: 'runtime', label: t(QUESTION_NAME.runtime), value: level === 'keep' ? t('As long as the original') : t(runtimeOf(runtime).label) })
  if (level) {
    const options = levelOptionsOf(draft)
    const index = Math.max(0, options.findIndex((o) => o.key === level))
    rows.push({ key: 'level', label: t(QUESTION_NAME.level), value: `${index + 1} ${t(options[index].label)} · ${t(options[index].sub)}` })
  }
  rows.push({ key: 'material', label: t('Material'), value: draft.file ? draft.file.name : t('Idea text only') })
  // 채팅 언어 줄은 없앴다(2026-10-21 오너 "Chat Language 삭제") — 채팅은 지금처럼 사이트 언어를 따른다.
  if (opts.series) rows.push(...seriesRows(opts.series, t, mode))
  return rows
}

/** 시리즈 다음 화 줄 — 잠근 대사 언어, 이어받는 것(말투는 앞 화가 대사까지 끝났을 때만), 고른 경우 첫 샷. */
function seriesRows(series: EntrySeries, t: Translator, mode: 'confirm' | 'done'): SummaryRow[] {
  const rows: SummaryRow[] = []
  if (series.dialogueLanguage) {
    const name = dialogueLanguageName(series.dialogueLanguage)
    rows.push({ key: 'language', label: t('Language'), value: mode === 'confirm' ? `${name} · ${t('Same as the previous episode')}` : name, locked: true })
  }
  const carried = [
    t('{count} people', { count: series.characters }),
    t('{count} backgrounds', { count: series.locations }),
    t('Art style'),
    ...(series.hasVoices ? [t('Voices')] : []),
    t('Previous episode story'),
  ]
  rows.push({ key: 'carried', label: t('Carried over'), value: carried.join(' · ') })
  if (series.continuesLastScene) rows.push({ key: 'firstShot', label: t('First shot'), value: t('This episode starts from the last scene of the previous episode.') })
  return rows
}

/** 완료 화면 위쪽 재료 미리보기 — 아이디어 글, 없으면 파일 글 앞부분. */
export function materialPreview(draft: EntryDraft): string {
  const idea = draft.idea.trim()
  if (idea) return idea
  return fileHasText(draft.file) ? (draft.file!.text ?? '').trim().slice(0, 600) : ''
}
