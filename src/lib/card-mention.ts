// 카드/오브젝트 @멘션 라벨 생성 (클라 드롭다운 + 서버 라우트 컨텍스트가 공유 — 라벨/ref 일치 보장).
// 이름이 없는 "빈 깡통" 카드도 안정 ref(localId)로 멘션·지정 가능하게 한다.
// 같은 종류의 이름 없는 카드가 여러 개면 번호를 붙여 라벨을 고유하게 만든다(이름 미정 인물, 이름 미정 인물 2 …).
//
// i18n(#i18n-s5-batch4): label 은 LLM @멘션 텍스트 매칭의 식별자를 겸한다(활성 멘션 판정 —
//   activeMentionRefs/toggleMentionToken — 이 label 문자열 자체를 매칭 키로 쓴다) + 클라(드롭다운
//   렌더)·서버(produce/chat/route.ts, LLM 컨텍스트에 "@{label}" 을 주입)가 이 값을 공유한다.
//   따라서 label(이름 있는 카드는 그대로, 없는 카드의 "이름 미정 …" 폴백)은 로케일과 무관하게
//   고정한다 — 클라·서버가 서로 다른 locale 해석으로 다른 문자열을 만들면 LLM 이 되돌려준
//   @멘션이 클라의 멘션 목록과 매칭되지 않는 조용한 고장이 된다. hint(카테고리 배지, 순수 표시용 —
//   매칭에 안 쓰이고 서버도 안 읽음, 실측 확인)만 locale 인자로 번역한다.
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'

// locale 인자를 안 넘기는 기존 호출부(global-chat.tsx — 범위 밖, hint 를 그대로 렌더)가 조용히
//   깨지지 않도록, 함수 도입 이전 동작(항상 한국어)을 기본값으로 보존한다. 앱 전역 DEFAULT_LOCALE
//   ('en')과 다른 값을 의도적으로 쓴다 — 이건 "새 기능의 기본"이 아니라 "미갱신 호출부의 하위호환".
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

export interface CardMention {
  ref: string // 카드 안정 핸들 (localId) — AI가 이름 없는 카드도 정확히 지정
  label: string // 표시/삽입 라벨 (이름 또는 "이름 미정 …") — 매칭 식별자 겸용, 로케일 고정
  hint: string // 종류 (인물/사물/배경) — 순수 표시용, 번역 가능
}

export type SceneShotMentionMode = 'writer' | 'previz' | 'real'

export interface SceneShotMentionTarget {
  kind: 'scene' | 'shot'
  id: string
  /** 사람이 읽는 이름. 최종 라벨에는 항상 id도 포함해 중복 이름을 구분한다. */
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

/**
 * Writer/Director가 공유하는 씬·샷 멘션 항목 생성기.
 * 표시 이름이 겹쳐도 id를 라벨에 포함하므로 자동완성과 카드 하이라이트가 1:1로 유지된다.
 */
export function sceneShotMentions(
  targets: readonly SceneShotMentionTarget[],
  mode: SceneShotMentionMode = 'writer',
): CardMention[] {
  const modeLabel = mode === 'writer' ? '' : `${mode === 'previz' ? 'Previz' : 'Real'} `
  const seen = new Set<string>()
  return targets.flatMap((target) => {
    const id = target.id.trim()
    const name = target.label.trim()
    if (!id || !name) return []
    const ref = sceneShotMentionRef(mode, target.kind, id)
    if (seen.has(ref)) return []
    seen.add(ref)
    const kindLabel = target.kind === 'scene' ? 'Scene' : 'Shot'
    const displayName = name.replace(new RegExp(`^${kindLabel}\\s+`, 'i'), '').trim() || name
    return [
      {
        ref,
        label: `${modeLabel}${kindLabel} ${displayName} · ${id}`,
        hint: `${mode === 'writer' ? '' : `${mode === 'previz' ? 'Previz' : 'Real'} `}${target.kind === 'scene' ? '씬' : '샷'}`,
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

export function castMentions(
  cast: CastLike[],
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): CardMention[] {
  const unnamed: Record<string, number> = {}
  return cast.map((m) => {
    // 매칭 키(label 폴백)는 로케일 고정(위 헤더 코멘트) — 표시용 hint 만 번역.
    const kind = m.entityType === 'object' ? '사물' : '인물'
    const hint = translate(locale, kind === '사물' ? 'Object' : 'Person')
    const named = m.name?.trim()
    let label: string
    if (named) {
      label = named
    } else {
      unnamed[kind] = (unnamed[kind] ?? 0) + 1
      label = `이름 미정 ${kind}${unnamed[kind] > 1 ? ` ${unnamed[kind]}` : ''}`
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
      label = `이름 미정 배경${unnamed > 1 ? ` ${unnamed}` : ''}`
    }
    return { ref: b.localId, label, hint: translate(locale, 'Background') }
  })
}

// 스토리/설정 등 비-엔티티 보드 요소도 @멘션·선택 가능하게 하는 고정 ref/label.
// AI는 보드 설정/스토리를 항상 컨텍스트로 받으므로 이 라벨 참조는 별도 매핑 없이 자연 해석된다.
export const FOUNDATION_MENTIONS: CardMention[] = [
  { ref: 'story', label: '스토리', hint: '설정' },
  { ref: 'setting:playtime', label: '러닝타임', hint: '설정' },
  { ref: 'setting:genre', label: '스토리 장르', hint: '설정' },
  { ref: 'setting:subGenre', label: '세부 장르', hint: '설정' },
  { ref: 'setting:format', label: '포맷', hint: '설정' },
  { ref: 'setting:tone', label: '톤', hint: '설정' },
  { ref: 'setting:dialogueLanguage', label: '대사 언어', hint: '설정' },
]

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
// 삽입 규칙은 global-chat 의 기존 append 동작과 일치시킨다.
export function toggleMentionToken(text: string, label: string): string {
  const token = `@${label}`
  const boundary = escapeRegExp(token) + '(?![0-9A-Za-z_])'
  if (new RegExp(boundary).test(text)) {
    return text
      .replace(new RegExp(boundary, 'g'), '')
      .replace(/ {2,}/g, ' ')
      .replace(/^ +| +$/g, '')
  }
  return `${text.replace(/\s*$/, text.trim() ? ' ' : '')}${token} `
}
