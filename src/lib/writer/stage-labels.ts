// writer 파이프라인 진행 화면용 자연어 단계 문구(#c3 2026-07-14).
//   내부 stage key(steps.ts 등록 키)를 영상 업계 사람이 읽기 자연스러운
//   "주체 + 행동" 문장으로 바꾼다. 표시 전용 — 로그/DB/status API 는 key 그대로.
//   key 목록은 src/lib/writer/pipeline/steps.ts 의 등록이 진실 (여기 없는 키는 fallback).
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'

// locale 을 안 넘기는 호출부(writer-generation-view.tsx 등)가 조용히 안 깨지도록 기존 동작
//   (항상 한국어)을 기본값으로 보존한다 — producer-gate.ts/card-mention.ts 와 동일 취급.
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

// 값은 영어 원문 = i18n 키(#i18n-s5-batch4). friendlyStageLabel 이 translate() 로 번역해 반환한다.
const STAGE_LABELS: Record<string, string> = {
  dramaturgy: 'Writer is finding the stage and dramatic material',
  narrativeStructure: 'Writer is building the story structure',
  scenes: 'Writer is creating scenes, backgrounds, and characters',
  storyCheck: 'Writer is reviewing the story',
  visualFormat: 'Artist is deciding the screen format and look',
  actVisualArc: 'Artist is shaping the visual arc for each act',
  v2Design: 'Artist is designing backgrounds and characters',
  sceneCinematography: 'Director is setting the cinematography for the scene',
  decoupage: 'Director is breaking the scene into shots',
  // 2-레인 합성 step(#2lane) — 옛 4키는 진행 중이던 run 의 표시를 위해 남겨 둔다.
  shotsAndDialogue: 'Director is refining shots and Writer is writing dialogue',
  shotDesign: 'Director is polishing the direction of the shots',
  shotCheck: 'Director is verifying the shot direction',
  renderPrompts: 'Director is writing the shooting instructions',
  dialogue: 'Writer is writing character dialogue',
  persistShots: 'Director is organizing and saving the shot list',
}

const FALLBACK_LABEL = 'The Writer team is working on it'

export function friendlyStageLabel(
  stageKey: string | null | undefined,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): string {
  if (!stageKey) return translate(locale, FALLBACK_LABEL)
  return translate(locale, STAGE_LABELS[stageKey] ?? FALLBACK_LABEL)
}

/** 남은 예상 시간 표시 문자열 — 분 단위 올림, 지나면 "곧 마무리돼요". */
export function formatRemaining(
  remainMs: number,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): string {
  if (remainMs <= 0) return translate(locale, 'Wrapping up soon')
  const min = Math.ceil(remainMs / 60_000)
  if (min <= 1) return translate(locale, 'Less than 1 minute remaining')
  return translate(locale, 'About {min} minutes remaining', { min })
}
