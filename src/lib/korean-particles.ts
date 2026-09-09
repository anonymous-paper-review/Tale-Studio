// 한국어 조사 맞춤(#names-in-prose 2026-09-08) — id 를 이름으로 바꾼 뒤 남는 "용족수장가" 를 "용족수장이" 로.
//   이름이 한글 음절로 끝날 때만 받침 유무로 고른다. 그 밖(영문·숫자로 끝나는 이름)은 손대지 않는다 — 틀린 조사보다
//   원문이 낫다. 이름 바로 뒤가 조사이고 그 뒤가 한글이 아닐 때만(어절 끝) 바꾼다: "요정수장가문" 은 조사가 아니다.

const PAIRS: ReadonlyArray<readonly [withBatchim: string, withoutBatchim: string]> = [
  ['이', '가'], // i18n-ok: 한국어 조사 규칙 자체
  ['을', '를'], // i18n-ok: 한국어 조사 규칙 자체
  ['은', '는'], // i18n-ok: 한국어 조사 규칙 자체
  ['과', '와'], // i18n-ok: 한국어 조사 규칙 자체
  ['아', '야'], // i18n-ok: 한국어 조사 규칙 자체
  ['으로', '로'], // i18n-ok: 한국어 조사 규칙 자체
]

function hangulJong(ch: string): number | null {
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return null
  return (code - 0xac00) % 28
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 이름 뒤 조사를 받침에 맞춘다. 이름 목록 순서·중복은 무관하다. */ // i18n-ok: 한국어 조사 규칙 자체
export function fixKoreanParticles(text: string, names: readonly string[]): string {
  let out = text
  const seen = new Set<string>()
  for (const raw of names) {
    const name = raw?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const jong = hangulJong(name[name.length - 1])
    if (jong === null) continue
    const hasBatchim = jong !== 0
    const isRieul = jong === 8
    const alts = PAIRS.flatMap(([a, b]) => [a, b]).sort((a, b) => b.length - a.length)
    const re = new RegExp(`${escapeRegExp(name)}(${alts.map(escapeRegExp).join('|')})(?![가-힣])`, 'g') // i18n-ok: 한국어 조사 규칙 자체
    out = out.replace(re, (_m, particle: string) => {
      const pair = PAIRS.find(([a, b]) => a === particle || b === particle)
      if (!pair) return _m
      const [withB, withoutB] = pair
      // 으로/로: 받침 없음 또는 ㄹ 받침이면 '로'.
      const want = withB === '으로' ? (hasBatchim && !isRieul ? '으로' : '로') : hasBatchim ? withB : withoutB // i18n-ok: 한국어 조사 규칙 자체
      return `${name}${want}`
    })
  }
  return out
}
