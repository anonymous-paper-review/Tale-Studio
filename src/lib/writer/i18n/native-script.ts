// 화면 칸(_native)에 어떤 글을 넣을지 정하는 규칙 — 파이프라인 저장(persist_manifest)과 이미 저장된 행 고치기가 같은 함수를 쓴다.
//   배경: 영어 프로젝트는 "표시 = 영어 base" 라 deriveNativeBatch 가 빈 맵을 돌려준다. 그런데 모델이 어느 씬의 글을 한국어로
//   써 오면(직접 고친 산문 · 대본에서 옮긴 씬 등) 저장 코드가 `옮긴 글 ?? 원문` 으로 한국어 원문을 화면 칸에 넣었다 —
//   영어 프로젝트의 Storyboard 샷 설명이 한국어로 보인 원인(운영 씬 2 · 3 의 샷 19개, 2026-11-15).
//   규칙: 옮긴 글이 없고 원문이 프로젝트 언어 글자가 아니면 영어 base(주 칸)를 화면 칸에 쓴다.
//     - 프로젝트 언어로 옮긴 글이 있으면 그대로(종전). 원문이 프로젝트 언어면 원문 그대로(종전).
//     - 원문이 영어(라틴)면 그대로(옮길 것이 없다). 영어 글이 없으면(번역 실패) 원문 그대로(둘 곳이 없다).
//   순수 모듈 — node:crypto 외에 아무것도 읽지 않는다(DB · 비밀 값 · 모델 호출 없음). derive-en.ts 는 서버 전용
//   (supabaseAdmin · claudeJSON 의존)이라 스크립트(scripts/ops/plan-native-repair.mts)가 못 불러서, 스크립트와 저장 코드가
//   함께 쓸 것은 여기 둔다. Node 의 타입 지우기로 바로 돌아야 하므로 enum · namespace 같은 타입 전용이 아닌 문법은 쓰지 않는다.
import { createHash } from 'node:crypto'

/** native 원천 텍스트의 안정 해시 — i18n_provenance 에 기록(편집→stale 판정 근거, S6). */
export function i18nHash(s: string): string {
  return createHash('md5').update(s).digest('hex')
}

// 영어(라틴)가 아니라 옮겨야 하는 글자 — CJK 기호 · 가나 · 한자(U+3000-9FFF) · 한글(U+AC00-D7AF) · 전각(U+FF00-FFEF). 보수적 필터.
const NEEDS_TRANSLATION = /[　-鿿가-힯＀-￯]/ // i18n-ok — 문자 클래스 경계값(문구 아님)
const NEEDS_TRANSLATION_EVERY = new RegExp(NEEDS_TRANSLATION.source, 'g')
const LATIN_LETTER_EVERY = /[A-Za-z]/g

/** 한글 · 한자 · 가나 · 전각 글자가 있는가 — deriveEnBatch 가 옮길 글을 가르는 것과 같은 판정(없으면 이미 영어로 보고 무변환 통과). */
export function needsTranslation(text: string | null | undefined): boolean {
  return NEEDS_TRANSLATION.test(text ?? '')
}

// locale 별 "이미 타깃 언어" 스크립트 — 있으면 번역 skip(원문/사람 산출 보존, 비용↓). ko 외는 확장 여지.
const LOCALE_SCRIPT: Record<string, RegExp> = {
  ko: /[가-힣]/, // i18n-ok — 한글 음절 문자 클래스 경계값(문구 아님)
  ja: /[぀-ゟ゠-ヿ一-鿿]/, // 히라가나 · 가타카나 · 한자
  zh: /[一-鿿]/, // 한자
}
export function isTargetScript(text: string | null | undefined, locale: string): boolean {
  const re = LOCALE_SCRIPT[locale]
  return re ? re.test(text ?? '') : false
}

/** 영어 글자가 한글 · 한자 · 가나보다 많은가 — 번역 모델이 지명 몇 글자를 한글 그대로 둔 영어 문장도 영어로 본다. */
function looksEnglish(text: string): boolean {
  const latin = text.match(LATIN_LETTER_EVERY)?.length ?? 0
  const foreign = text.match(NEEDS_TRANSLATION_EVERY)?.length ?? 0
  return latin > foreign
}

/**
 * 원문 대신 화면에 둘 영어 글 — 원문에 옮겨야 할 글자가 있고, 주 칸(en)에 그와 다른 영어 글이 있을 때만. 없으면 null.
 *   en === raw 는 옮기지 못했다는 뜻(번역 실패)이라 둘 것이 없다.
 */
function englishStandIn(raw: string, en: string): string | null {
  const r = raw.trim()
  const e = en.trim()
  if (!e || e === r) return null
  if (!needsTranslation(r)) return null
  if (!looksEnglish(e)) return null
  return en
}

export interface NativeChoice {
  /** 화면 칸(_native)에 넣을 글 */
  text: string
  /** true = 영어 base 에서 온 글(옮긴 글이거나 영어 글을 그대로 쓴 것) — provenance 에 영어 글 해시를 남긴다. */
  fromEn: boolean
}

/**
 * 한 칸의 화면 글(_native)을 정한다. persist 의 샷 · 씬 · 인물 칸과 저장된 행 고치기가 모두 이 함수 하나를 쓴다.
 * @param raw 파이프라인이 낸 원문(주 칸의 출처)
 * @param en 주 칸에 들어간(들어갈) 영어 base. 옮기지 못했으면 원문과 같다.
 * @param derived 영어 → 프로젝트 언어로 옮긴 글. 영어 프로젝트이거나 옮기지 못했으면 없다.
 * @param keepSource true 면 원문이 사람이 쓴 원천(대본에서 옮긴 씬의 요약)이라 영어로 갈아끼우지 않는다.
 */
export function chooseNativeText(input: {
  locale: string
  raw: string
  en: string
  derived?: string
  keepSource?: boolean
}): NativeChoice {
  const { locale, raw, en, derived, keepSource } = input
  if (derived !== undefined) return { text: derived, fromEn: !isTargetScript(raw, locale) }
  if (!isTargetScript(raw, locale) && !keepSource) {
    const standIn = englishStandIn(raw, en)
    if (standIn !== null) return { text: standIn, fromEn: true }
  }
  return { text: raw, fromEn: false }
}

/** 영어 글에서 온 화면 칸의 출처 기록 조각 — `<칸>_native: 영어 글 해시`. 영어 글에서 온 것이 아니면 빈 객체. */
export function nativeProvenance(field: string, choice: Pick<NativeChoice, 'fromEn'>, en: string): Record<string, string> {
  return choice.fromEn ? { [`${field}_native`]: i18nHash(en) } : {}
}

// ── 이미 저장된 샷 행 고치기 (순수 · DB 접근 없음) ──────────────────────────────

export interface NativeRepairRow {
  id: string | number
  shot_id?: string | null
  scene_id?: string | null
  /** 주 칸 — 영어 base */
  action_description?: string | null
  /** 화면 칸 */
  action_description_native?: string | null
  i18n_provenance?: Record<string, unknown> | null
}

export interface NativeRepairPatch {
  id: string | number
  action_description_native: string
  i18n_provenance: Record<string, unknown>
}

export type NativeRepairSkipReason =
  | 'not-english-project' // 영어 프로젝트가 아니다
  | 'empty-native' // 화면 칸이 비었다
  | 'already-english' // 화면 칸이 이미 영어다(영어 설명과 달라도 건드리지 않는다)
  | 'no-english-source' // 옮겨 둔 영어 설명이 없다(비었거나 한국어)
  | 'maybe-edited' // 저장 때의 원문과 다르거나 출처 기록이 없다 — 사람이 고쳤을 수 있다

export interface NativeRepairSkip {
  id: string | number
  shot_id: string | null
  reason: NativeRepairSkipReason
}

export interface NativeRepairReview {
  patches: NativeRepairPatch[]
  skipped: NativeRepairSkip[]
}

export interface NativeRepairOptions {
  /** true 면 화면 칸이 저장 때의 원문인지(provenance.action_description 해시) 확인하지 않고 고친다. 기본은 확인한다. */
  allowUnproven?: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * 샷 행마다 고칠지 말지 가르고 이유를 남긴다. 영어 프로젝트만 고친다 — 영어 글이 이미 주 칸에 있는 것이 이 구멍의 조건이다.
 *   고치는 값은 저장 코드와 같은 chooseNativeText · nativeProvenance 에서 나온다(고친 행 = 고친 저장 코드가 새로 만든 행).
 *   사람이 고쳤을 수 있는 행(화면 칸이 저장 때의 원문과 다름 · 출처 기록 없음)은 건드리지 않는다 — 덮으면 되돌릴 길이 없다.
 */
export function reviewNativeScriptRepair(
  projectLocale: string,
  rows: readonly NativeRepairRow[],
  opts: NativeRepairOptions = {},
): NativeRepairReview {
  const locale = projectLocale.trim().toLowerCase()
  const review: NativeRepairReview = { patches: [], skipped: [] }
  for (const row of rows) {
    const skip = (reason: NativeRepairSkipReason) => {
      review.skipped.push({ id: row.id, shot_id: row.shot_id ?? null, reason })
    }
    const native = row.action_description_native ?? ''
    const main = row.action_description ?? ''
    if (locale !== 'en') {
      skip('not-english-project')
      continue
    }
    if (!native.trim()) {
      skip('empty-native')
      continue
    }
    if (!needsTranslation(native)) {
      skip('already-english')
      continue
    }
    const choice = chooseNativeText({ locale, raw: native, en: main })
    if (!choice.fromEn) {
      skip('no-english-source')
      continue
    }
    const provenance = isRecord(row.i18n_provenance) ? row.i18n_provenance : {}
    if (!opts.allowUnproven && provenance.action_description !== i18nHash(native)) {
      skip('maybe-edited')
      continue
    }
    review.patches.push({
      id: row.id,
      action_description_native: choice.text,
      i18n_provenance: { ...provenance, ...nativeProvenance('action_description', choice, main) },
    })
  }
  return review
}

/** 고칠 행만 [{ id, action_description_native, i18n_provenance }] 로. 이유가 필요하면 reviewNativeScriptRepair. */
export function planNativeScriptRepair(
  projectLocale: string,
  rows: readonly NativeRepairRow[],
  opts: NativeRepairOptions = {},
): NativeRepairPatch[] {
  return reviewNativeScriptRepair(projectLocale, rows, opts).patches
}
