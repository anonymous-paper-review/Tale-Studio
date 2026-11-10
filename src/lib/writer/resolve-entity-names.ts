// 표시·산문용 id → 이름 치환(#id-leak 2026-08-11, #names-in-prose 2026-09-08).
//
//   파이프라인이 산문 안에 인물·장소 id(char·char_3·location_2)를 그대로 쓴다(프로덕션 실측). 로스터에 있는 id 만
//   이름으로 바꾸고, 모르는 id 는 지어내지 않는다 — 틀린 이름은 안 고친 id 보다 나쁘다.
//   2026-09-08: 한글 이름은 슬러그가 비어 'char' 로 폴백하므로 맨몸 id 도 로스터에 있으면 바꾼다. 긴 id 가 먼저
//   잡혀(char_2 → char) 접두 오인이 없고, 바꾼 뒤 한국어 조사를 받침에 맞춘다.
//   2026-11-10(qa1110 C12): 이름 안에 id 낱말이 든 인물(The Keeper · keeper)은 바꿀 때마다 "The The Keeper"로 겹쳤다 —
//   이미 이름이 쓰인 자리 안의 id 낱말은 다시 바꾸지 않고, 관사로 시작하는 이름 앞에 겹친 관사는 하나로 걷는다
//   (예전에 겹쳐 저장된 산문도 보일 때 바로잡힌다). 표시용 replaceSlugs(script-lines)도 같은 두 규칙을 쓴다.
//   2026-11-10(qa1110 R2): 대본 그대로의 배경 번호는 장면 머리 글자 그대로(BUS · COUNTRY ROAD)라 대소문자를 가리지 않고 바꾸면
//   문장 속 보통 낱말 "bus"가 "BUS"가 됐다(저장 글 · 그림 프롬프트까지). 슬러그 꼴이 아닌 번호는 글자 그대로일 때만 바꾸고,
//   번호와 이름이 대소문자만 다르면 바꾸지 않는다(keyRule). 슬러그 꼴 번호 · 인물은 지금처럼 대소문자를 가리지 않는다.
import { fixKoreanParticles } from '@/lib/korean-particles'

interface NamedEntity {
  id: string
  name: string
}

/** 영어 낱말과 겹치는 폴백 id — 한글 조사가 붙은 자리에서만 id 로 인정한다. */
const GENERIC_WORD_IDS = new Set(['location', 'loc'])

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 슬러그 꼴 id(소문자 · 숫자 · 밑줄 · 붙임표 — char_2 · bus_stop · maya)인가. 아니면 장면 머리 글자 그대로의 번호(BUS · COUNTRY ROAD)다. */
export function isSlugId(id: string): boolean {
  return /^[a-z0-9_-]+$/.test(id.trim())
}

/** 번호를 어떻게 찾나 — 'any' = 대소문자 가리지 않음(슬러그 꼴), 'exact' = 글자 그대로만(장면 머리 번호),
 *  'skip' = 바꾸지 않음(장면 머리 번호와 이름이 대소문자만 다름 — 바꿔도 대소문자만 바뀐다). */
export function keyRule(id: string, name: string): 'any' | 'exact' | 'skip' {
  const key = id.trim()
  if (isSlugId(key)) return 'any'
  const label = name.trim()
  return label !== key && label.toLowerCase() === key.toLowerCase() ? 'skip' : 'exact'
}

/** text 안에 이름이 이미 그대로 쓰인 자리들([시작, 끝)) — 대소문자 그대로. 경계는 id 토큰과 같은 영숫자 기준이라
 *  한국어 조사가 바로 붙은 이름("The Keeper가")도 이름 자리로 본다. */
export function writtenNameSpans(text: string, names: Iterable<string>): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (const name of new Set([...names].map((n) => n.trim()).filter(Boolean))) {
    for (const m of text.matchAll(new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(name)}(?![A-Za-z0-9_])`, 'gu'))) {
      spans.push([m.index, m.index + m[0].length])
    }
  }
  return spans
}

/** [at, at+length) 가 이미 쓰인 이름 자리의 일부인가 — 이름 안의 id 낱말("The Keeper" 의 Keeper)은 다시 바꾸지 않는다.
 *  토큰이 이름 자리 전체와 같으면(Kai · kai) 일부가 아니다 — 바꿔도 같은 이름이고, @ 를 붙이는 길에서는 @ 가 붙어야 한다(검토 B). */
export function insideWrittenName(spans: ReadonlyArray<readonly [number, number]>, at: number, length: number): boolean {
  return spans.some(([start, end]) => start <= at && at + length <= end && end - start > length)
}

/** 관사(The · A · An)로 시작하는 이름 바로 앞에 겹친 관사를 걷는다 — "the The Keeper" · 예전에 겹쳐 저장된 "The The Keeper" → "The Keeper".
 *  이름 머리와 같은 관사만(the↔The, a·an↔A·An), 같은 줄 안에서만 — 줄 바꿈을 지우지 않게(검토 A).
 *  A · An 이름은 소문자 a · an 만 걷고, 대문자 A · An 은 줄 처음 · 문장 처음일 때만 — "Cell A a stranger" 의 꼬리표 A 를
 *  관사로 보고 지우지 않게(검토 B). The 는 꼬리표가 아니라 대소문자 모두 걷는다.
 *  prefix(@)를 붙여 보이는 길이면 이름 앞의 @ 는 있어도 없어도 된다(예전에 @ 없이 겹쳐 저장된 이름도 걷는다). */
export function collapseDoubledArticles(text: string, names: Iterable<string>, prefix = ''): string {
  let out = text
  const marker = prefix ? `(?:${escapeRegExp(prefix)})?` : ''
  for (const name of new Set([...names].map((n) => n.trim()).filter(Boolean))) {
    const head = /^(the|an?)\s/i.exec(name)?.[1].toLowerCase()
    if (!head) continue
    const target = `(?=${marker}${escapeRegExp(name)}(?![A-Za-z0-9_]))`
    if (head === 'the') {
      out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])(?:[Tt][Hh][Ee][ \\t]+)+${target}`, 'gu'), '')
      continue
    }
    // 줄 처음 · 문장 처음(. ! ? … 와 닫는 따옴표 · 괄호 뒤)의 겹친 관사는 대문자여도 걷는다.
    out = out.replace(new RegExp(`(?<=^|\\n|[.!?…]["'”’)\\]]*[ \\t]+)(?:[Aa][Nn]?[ \\t]+)+${target}`, 'gu'), '')
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])(?:an?[ \\t]+)+${target}`, 'gu'), '')
  }
  return out
}

/** 일반 낱말의 접두를 장소·인물 참조로 오인하지 않는 정확한 토큰 조회. */
export function containsEntityToken(text: string, value: string): boolean {
  if (!value.trim()) return false
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(value.trim())}(?![A-Za-z0-9_])`, 'iu').test(text)
}

/** id 를 이름으로 바꾼 문장. 대응하는 이름이 없으면 원문 그대로(모르는 건 지어내지 않는다). */
export function resolveEntityNames(
  text: string | null | undefined,
  entities: readonly NamedEntity[],
): string {
  if (!text) return ''
  if (entities.length === 0) return text

  const byId = new Map<string, string>()
  // 장면 머리 번호(슬러그 꼴 아님)는 글자 그대로일 때만 — 소문자로 찾은 토큰이 이 원래 글자와 같아야 바꾼다.
  const exactIds = new Map<string, string>()
  for (const e of entities) {
    if (!e.id || !e.name?.trim()) continue
    const id = e.id.trim().toLowerCase()
    if (!id) continue
    const rule = keyRule(e.id, e.name)
    if (rule === 'skip') continue
    if (rule === 'exact') exactIds.set(id, e.id.trim())
    byId.set(id, e.name.trim())
  }
  // 정확한 등록 ID를 모두 먼저 채운다. 다른 인물의 별칭이 실제 ID를 덮어쓰지 않는다.
  for (const [id, name] of [...byId]) {
    // `char_3` 로 저장돼 있어도 실제 id 가 `character_3` 인(혹은 그 반대인) 경우를 함께 받는다.
    const alias = id.replace(/^character_/, 'char_').replace(/^location_/, 'loc_')
    if (alias !== id && !byId.has(alias)) byId.set(alias, name)
    const expanded = id.replace(/^char_/, 'character_').replace(/^loc_/, 'location_')
    if (expanded !== id && !byId.has(expanded)) byId.set(expanded, name)
  }
  if (byId.size === 0) return text

  // 토큰 경계: 앞뒤가 영숫자/언더바가 아닐 때만 — `char_30` 을 `char_3` 으로, `charcoal` 을 `char` 로 잘못 짚지 않게.
  //   긴 id 부터 하나의 정규식으로 잡는다(교대 순서 = 길이 내림차순).
  //   영어 낱말이기도 한 폴백 id(location·loc)는 한글이 바로 뒤따를 때만 id 로 본다 — "origin location of …" 의
  //   location 을 장소 이름으로 바꾸면 틀린 문장이 된다(겨울_7 sh_01_05 실측).
  const keys = [...byId.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)
  const re = new RegExp(`(?<![A-Za-z0-9_])(?:${keys.join('|')})(?![A-Za-z0-9_])`, 'gi')
  const names = new Set([...byId.values()])
  const written = writtenNameSpans(text, names)
  let out = text.replace(re, (token, offset: number, whole: string) => {
    const lower = token.toLowerCase()
    if (GENERIC_WORD_IDS.has(lower) && !/^[가-힣]/.test(whole.slice(offset + token.length))) return token // i18n-ok: 한글 범위 판정
    // 이미 쓰인 이름 안의 id 낱말(The Keeper 의 Keeper)은 그대로 — 또 바꾸면 "The The Keeper".
    if (insideWrittenName(written, offset, token.length)) return token
    // 장면 머리 번호(BUS)는 글자 그대로 쓴 자리만 — 문장 속 보통 낱말 "bus"는 그대로.
    const exact = exactIds.get(lower)
    if (exact !== undefined && token !== exact) return token
    return byId.get(lower) ?? token
  })
  out = collapseDoubledArticles(out, names)

  // 이름으로 치환하고 나면 "The father (Kai)" 처럼 동격 괄호가 남는다 — 앞말과 같은 대상을
  //   가리키는 군더더기라 괄호만 벗겨 문장을 자연스럽게 둔다. (이름이 들어간 괄호에만 적용)
  out = out.replace(/\s*\(([^()]{1,40})\)/g, (whole, inner: string) =>
    names.has(inner.trim()) ? '' : whole,
  )

  return fixKoreanParticles(out, [...names])
}

/** SceneManifest 의 인물+장소를 한 목록으로 — 두 종류가 한 문장에 섞여 나오므로 함께 푼다. */
export function manifestEntities(manifest: {
  characters?: ReadonlyArray<{ characterId: string; name: string }>
  locations?: ReadonlyArray<{ locationId: string; name: string }>
} | null | undefined): NamedEntity[] {
  if (!manifest) return []
  return [
    ...(manifest.characters ?? []).map((c) => ({ id: c.characterId, name: c.name })),
    ...(manifest.locations ?? []).map((l) => ({ id: l.locationId, name: l.name })),
  ]
}
