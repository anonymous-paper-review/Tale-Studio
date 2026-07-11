// 카드/오브젝트 @멘션 라벨 생성 (클라 드롭다운 + 서버 라우트 컨텍스트가 공유 — 라벨/ref 일치 보장).
// 이름이 없는 "빈 깡통" 카드도 안정 ref(localId)로 멘션·지정 가능하게 한다.
// 같은 종류의 이름 없는 카드가 여러 개면 번호를 붙여 라벨을 고유하게 만든다(이름 미정 인물, 이름 미정 인물 2 …).

export interface CardMention {
  ref: string // 카드 안정 핸들 (localId) — AI가 이름 없는 카드도 정확히 지정
  label: string // 표시/삽입 라벨 (이름 또는 "이름 미정 …")
  hint: string // 종류 (인물/사물/배경)
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

export function castMentions(cast: CastLike[]): CardMention[] {
  const unnamed: Record<string, number> = {}
  return cast.map((m) => {
    const hint = m.entityType === 'object' ? '사물' : '인물'
    const named = m.name?.trim()
    let label: string
    if (named) {
      label = named
    } else {
      unnamed[hint] = (unnamed[hint] ?? 0) + 1
      label = `이름 미정 ${hint}${unnamed[hint] > 1 ? ` ${unnamed[hint]}` : ''}`
    }
    return { ref: m.localId, label, hint }
  })
}

export function backgroundMentions(backgrounds: BackgroundLike[]): CardMention[] {
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
    return { ref: b.localId, label, hint: '배경' }
  })
}

// 스토리/설정 등 비-엔티티 보드 요소도 @멘션·선택 가능하게 하는 고정 ref/label.
// AI는 보드 설정/스토리를 항상 컨텍스트로 받으므로 이 라벨 참조는 별도 매핑 없이 자연 해석된다.
export const FOUNDATION_MENTIONS: CardMention[] = [
  { ref: 'story', label: '스토리', hint: '설정' },
  { ref: 'setting:playtime', label: '러닝타임', hint: '설정' },
  { ref: 'setting:genre', label: '장르', hint: '설정' },
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
