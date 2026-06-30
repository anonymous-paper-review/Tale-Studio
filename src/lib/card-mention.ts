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
