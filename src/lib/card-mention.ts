// 카드/오브젝트 @멘션 라벨 생성 (클라 드롭다운 + 서버 라우트 컨텍스트가 공유 — 라벨/ref 일치 보장).
// 이름이 없는 "빈 깡통" 카드도 안정 ref(localId)로 멘션·지정 가능하게 한다.
// 같은 종류의 이름 없는 카드가 여러 개면 번호를 붙여 라벨을 고유하게 만든다(이름 미정 인물, 이름 미정 인물 2 …).
//
// i18n: label 은 입력창 @멘션 텍스트 매칭의 식별자를 겸한다(활성 멘션 판정 — activeMentionRefs/toggleMentionToken —
//   이 label 문자열 자체를 매칭 키로 쓴다). 오너 2026-11-14 답 7(전역 — 영어 화면에 한국어가 나오지 않게) 뒤로 label 도
//   화면 언어로 짓는다: 고르기 목록과 입력창 글자는 같은 화면 언어로 서로 맞고(클라 안), 서버(produce/chat/route.ts)는
//   LLM 컨텍스트에 두 말 이름(@이름 미정 인물 · @Unnamed person)을 모두 실어 어느 말로 넣은 @멘션도 찾는다.
//   씬 · 샷 이름은 "씬 2" · "샷 8" / "Scene 2" · "Shot 8"(lib/board-names), Director 는 보기 단추 이름을 앞에 붙인다(러프 · 실사).
import { translate } from '@/lib/i18n'
import { sceneName, shotName } from '@/lib/board-names'
import type { AppLocale } from '@/lib/locale'

// locale 인자를 안 넘기는 호출부(서버 produce/chat 의 LLM 문맥 — 라벨만 쓴다)가 조용히
//   깨지지 않도록, 함수 도입 이전 동작(항상 한국어)을 기본값으로 보존한다. 채팅 고르기(global-chat.tsx)는
//   2026-11-10 부터 화면 언어를 넘긴다. 앱 전역 DEFAULT_LOCALE
//   ('en')과 다른 값을 의도적으로 쓴다 — 이건 "새 기능의 기본"이 아니라 "미갱신 호출부의 하위호환".
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

export interface CardMention {
  ref: string // 카드 안정 핸들 (localId) — AI가 이름 없는 카드도 정확히 지정
  label: string // 표시/삽입 라벨 (이름 또는 "이름 미정 …" · "Unnamed …") — 입력창 매칭 식별자 겸용, 화면 언어
  hint: string // 종류 (인물/사물/배경) — 순수 표시용, 번역 가능
}

export type SceneShotMentionMode = 'writer' | 'previz' | 'real'

export interface SceneShotMentionTarget {
  kind: 'scene' | 'shot'
  id: string
  /** 사람이 읽는 이름. 내부 id 는 라벨에 넣지 않는다(#internal-id-scrub) — ref 가 식별을 전담. */
  label: string
}

/**
 * 씬/샷 멘션의 안정 ref. Director는 같은 대상이라도 Previz와 Real 산출물이
 * 다르므로 mode를 ref에 포함한다.
 */
export function sceneShotMentionRef(
  mode: SceneShotMentionMode,
  kind: SceneShotMentionTarget['kind'],
  id: string,
): string {
  return `${mode}:${kind}:${id}`
}

/** 보기 이름(Director 의 러프 · 실사) — 멘션 이름 · 꼬리표 앞에 붙는다. 영어는 예전 그대로("Previz" · "Real"). */
function modeWord(mode: SceneShotMentionMode, locale: AppLocale): string {
  if (mode === 'writer') return ''
  if (mode === 'previz') return locale === 'ko' ? translate(locale, 'Rough') : 'Previz'
  return translate(locale, 'Real')
}

/**
 * Writer/Director가 공유하는 씬·샷 멘션 항목 생성기.
 * #internal-id-scrub(2026-08-26, 오너 E5 "내부 ID 전면 금지"): 옛 라벨은 `… · ${id}` 로 내부
 *   id 를 그대로 노출했다("Real Shot 7 · sh_02_07" — 오너가 본 '변수'). 식별은 ref 가 전담하고
 *   라벨은 사람 이름만 쓴다. 규칙 생성명(씬 2 · 샷 8)은 구조상 유일해 dedup 도 유지된다.
 *   라벨은 화면 언어(오너 2026-11-14 답 7): 한국어 "샷 8" · "실사 샷 8" · "러프 샷 8", 영어 "Shot 8" · "Real Shot 8" · "Previz Shot 8".
 *   target.label 은 같은 화면 언어로 지은 이름이어야 한다(Director: boardNodeNames(…, locale), Writer: writerSceneShotMentions).
 */
export function sceneShotMentions(
  targets: readonly SceneShotMentionTarget[],
  mode: SceneShotMentionMode,
  locale: AppLocale,
): CardMention[] {
  const prefix = modeWord(mode, locale)
  const seen = new Set<string>()
  return targets.flatMap((target) => {
    const id = target.id.trim()
    const name = target.label.trim()
    if (!id || !name) return []
    const ref = sceneShotMentionRef(mode, target.kind, id)
    if (seen.has(ref)) return []
    seen.add(ref)
    // 이름 앞의 종류 낱말(두 말)을 떼고 이 화면 말로 다시 붙인다 — 사람이 지은 이름은 "샷 river_gaze"처럼 종류만 붙는다.
    const kindPattern = target.kind === 'scene' ? /^(?:scene|씬)\s+/i : /^(?:shot|샷)\s+/i // i18n-ok: 두 말의 종류 낱말을 뗀다
    const bare = name.replace(kindPattern, '').trim() || name
    const kindName = target.kind === 'scene' ? sceneName(locale, bare) : shotName(locale, bare)
    const kindWord = translate(locale, target.kind === 'scene' ? 'Scene' : 'Shot')
    return [
      {
        ref,
        label: prefix ? `${prefix} ${kindName}` : kindName,
        hint: prefix ? `${prefix} ${kindWord}` : kindWord,
      },
    ]
  })
}

export function isMentionModifierClick(
  event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>,
): boolean {
  return event.ctrlKey || event.metaKey
}

/**
 * 카드가 실제 멘션 항목으로 확인된 경우에만 modifier-click 요청을 만든다.
 * 알 수 없는/오염된 카드는 채팅 입력을 건드리지 않는다.
 */
export function mentionLabelForModifierClick(
  event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>,
  target: Pick<CardMention, 'label'> | null | undefined,
): string | null {
  if (!isMentionModifierClick(event)) return null
  const label = target?.label.trim()
  return label || null
}

interface CastLike {
  localId: string
  name?: string
  entityType?: string
}
interface BackgroundLike {
  localId: string
  name?: string
}

/** 이름 없는 카드의 @멘션 이름 — 영어 화면은 카드에 보이는 영어 이름(리드 2026-11-14, 오너 답 7 전역 규칙), 한국어는 예전 그대로. */
const UNNAMED_LABEL: Record<AppLocale, Record<'person' | 'object' | 'background', string>> = {
  en: { person: 'Unnamed person', object: 'Unnamed object', background: 'Unnamed background' },
  ko: { person: '이름 미정 인물', object: '이름 미정 사물', background: '이름 미정 배경' }, // i18n-ok: 한국어 화면의 @멘션 이름(예전 그대로)
}

function unnamedLabel(kind: 'person' | 'object' | 'background', locale: AppLocale, nth: number): string {
  return `${UNNAMED_LABEL[locale][kind]}${nth > 1 ? ` ${nth}` : ''}`
}

export function castMentions(
  cast: CastLike[],
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): CardMention[] {
  const unnamed: Record<string, number> = {}
  return cast.map((m) => {
    const kind = m.entityType === 'object' ? 'object' : 'person'
    const hint = translate(locale, kind === 'object' ? 'Object' : 'Person')
    const named = m.name?.trim()
    let label: string
    if (named) {
      label = named
    } else {
      unnamed[kind] = (unnamed[kind] ?? 0) + 1
      label = unnamedLabel(kind, locale, unnamed[kind])
    }
    return { ref: m.localId, label, hint }
  })
}

export function backgroundMentions(
  backgrounds: BackgroundLike[],
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): CardMention[] {
  let unnamed = 0
  return backgrounds.map((b) => {
    const named = b.name?.trim()
    let label: string
    if (named) {
      label = named
    } else {
      unnamed += 1
      label = unnamedLabel('background', locale, unnamed)
    }
    return { ref: b.localId, label, hint: translate(locale, 'Background') }
  })
}

// 스토리/설정 등 비-엔티티 보드 요소도 @멘션·선택 가능하게 하는 고정 ref/label.
// AI는 보드 설정/스토리를 항상 컨텍스트로 받으므로 이 라벨 참조는 별도 매핑 없이 자연 해석된다.
// 이름 · 종류 표시는 화면 언어로 옮긴다(2026-11-10 오너 "영어 언어에서 한국어 나오는거 수정") — 이 라벨은 서버가 읽지 않고,
//   채팅 입력의 @글자와 고르기 목록(그리고 Producer 보드의 스토리 카드)이 같은 화면 언어로 서로 맞춘다. 값은 영어 원문 = 사전 키.
const FOUNDATION_LABELS: ReadonlyArray<{ ref: string; label: string }> = [
  { ref: 'story', label: 'Story' },
  { ref: 'setting:playtime', label: 'Runtime' },
  { ref: 'setting:genre', label: 'Story genre' },
  { ref: 'setting:subGenre', label: 'Sub-genre' },
  { ref: 'setting:format', label: 'Format' },
  { ref: 'setting:tone', label: 'Tone' },
  { ref: 'setting:dialogueLanguage', label: 'Dialogue language' },
]

export function foundationMentions(locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK): CardMention[] {
  return FOUNDATION_LABELS.map(({ ref, label }) => ({ ref, label: translate(locale, label), hint: translate(locale, 'Settings') }))
}

// 입력창 텍스트에서 현재 @멘션된 카드들의 ref를 추출한다(입력↔카드 하이라이트 동기화용).
// 긴 라벨부터 매칭/소비해 "이름 미정 인물"이 "이름 미정 인물 2"의 접두어로 오인식되지 않게 한다.
export function activeMentionRefs(
  text: string,
  items: { ref: string; label: string }[],
): string[] {
  let work = text
  const refs: string[] = []
  for (const it of [...items].sort((a, b) => b.label.length - a.label.length)) {
    const token = `@${it.label}`
    if (work.includes(token)) {
      refs.push(it.ref)
      work = work.split(token).join(' ')
    }
  }
  return refs
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 입력창에서 한 멘션을 토글한다: 이미 있으면 지우고, 없으면 끝에 붙인다.
// 스크립트 라인(@L5)처럼 숫자 접미어가 접두 충돌하는 라벨을 위해 제거는 경계 인식
//   — @L5 는 지우되 @L51 은 건드리지 않는다((?![0-9A-Za-z_]) lookahead).
//   이름 없는 카드처럼 " 2"가 붙는 라벨도 — "@이름 미정 인물"을 빼면서 "@이름 미정 인물 2"의 앞부분을 지우지 않는다((?!\s+\d), 리드 검토 4).
// 삽입 규칙은 global-chat 의 기존 append 동작과 일치시킨다.
export function toggleMentionToken(text: string, label: string): string {
  const token = `@${label}`
  const boundary = escapeRegExp(token) + '(?![0-9A-Za-z_]|\\s+\\d)'
  if (new RegExp(boundary).test(text)) {
    return text
      .replace(new RegExp(boundary, 'g'), '')
      .replace(/ {2,}/g, ' ')
      .replace(/^ +| +$/g, '')
  }
  return `${text.replace(/\s*$/, text.trim() ? ' ' : '')}${token} `
}
