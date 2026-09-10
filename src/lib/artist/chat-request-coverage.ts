// 명시적인 새 모습 추가 문장에서 언급된 인물과 전달된 제안만 대조한다. 실행할 작업을 만들지 않는다.
import type { AppearanceCreation } from './chat-updates'

/** 범용 의도 추론이 아니다. 질문·인용·제외·비교가 없는 한국어 추가 지시만 다룬다. */
export function isExplicitAppearanceAddition(message: string): boolean {
  return /(?:모습|외형|버전)/u.test(message) // i18n-ok: 사용자 지시 판별 정규식
    && /(?:추가해|생성해|만들어)\s*(?:줘|주세요|주라)[.!。！\s]*$/u.test(message) // i18n-ok: 명령형 판별
    && !/[?？"'“”‘’「」『』`]/u.test(message)
    && !/(?:제외|빼고|말고|말아|하지\s*마|비교|처럼|보다|대신|질문|인용|문장)/u.test(message) // i18n-ok: 제외·인용·비교 판별
}

interface RegisteredCharacter { character_id: string; name: string }

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function missingMentionedAppearanceNames(
  message: string,
  characters: readonly RegisteredCharacter[],
  creations: readonly AppearanceCreation[],
): string[] {
  const named = characters.filter((character) => character.name?.trim())
  const mentioned = named.filter((character) => {
    const name = character.name.trim()
    // 동명이인은 이름만으로 ID를 확정하지 않는다.
    if (named.filter((other) => other.name.trim() === name).length !== 1) return false
    const escaped = escapePattern(name)
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?:(?:의|와|과|도|은|는|이|가|을|를|에게|한테|랑|하고|만))?(?![\\p{L}\\p{N}_])`, 'u').test(message) // i18n-ok: 이름 뒤의 조사만 허용
  })
  if (mentioned.length < 2) return []
  // 이름이 다른 문맥에 나타났다는 이유만으로 미처리 대상이라고 보고하지 않는다.
  // 두 이름이 'A와 B의 ... 모습'처럼 같은 추가 요청에 나란히 적힌 경우만 다룬다.
  const together = new Set<string>()
  for (let i = 0; i < mentioned.length; i++) {
    for (let j = i + 1; j < mentioned.length; j++) {
      const a = escapePattern(mentioned[i].name.trim())
      const b = escapePattern(mentioned[j].name.trim())
      const join = '\\s*(?:와|과|랑|하고|및|,|·|&)\\s*' // i18n-ok: 이름을 잇는 표현 판별
      const pair = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${a}${join}${b}|${b}${join}${a})(?:의)?\\s+[^.!?\\n]*(?:모습|외형|버전)`, 'u') // i18n-ok: 같은 모습 요청의 이름만 대조
      if (pair.test(message)) {
        together.add(mentioned[i].character_id)
        together.add(mentioned[j].character_id)
      }
    }
  }
  const received = new Set(creations.map((creation) => creation.characterId))
  return mentioned.filter((character) => together.has(character.character_id) && !received.has(character.character_id)).map((character) => character.name)
}
