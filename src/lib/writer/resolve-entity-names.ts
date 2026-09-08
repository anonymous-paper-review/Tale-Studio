// 표시·산문용 id → 이름 치환(#id-leak 2026-08-11, #names-in-prose 2026-09-08).
//
//   파이프라인이 산문 안에 인물·장소 id(char·char_3·location_2)를 그대로 쓴다(프로덕션 실측). 로스터에 있는 id 만
//   이름으로 바꾸고, 모르는 id 는 지어내지 않는다 — 틀린 이름은 안 고친 id 보다 나쁘다.
//   2026-09-08: 한글 이름은 슬러그가 비어 'char' 로 폴백하므로 맨몸 id 도 로스터에 있으면 바꾼다. 긴 id 가 먼저
//   잡혀(char_2 → char) 접두 오인이 없고, 바꾼 뒤 한국어 조사를 받침에 맞춘다.
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

/** id 를 이름으로 바꾼 문장. 대응하는 이름이 없으면 원문 그대로(모르는 건 지어내지 않는다). */
export function resolveEntityNames(
  text: string | null | undefined,
  entities: readonly NamedEntity[],
): string {
  if (!text) return ''
  if (entities.length === 0) return text

  const byId = new Map<string, string>()
  for (const e of entities) {
    if (!e.id || !e.name?.trim()) continue
    const id = e.id.trim().toLowerCase()
    if (!id) continue
    byId.set(id, e.name.trim())
    // `char_3` 로 저장돼 있어도 실제 id 가 `character_3` 인(혹은 그 반대인) 경우를 함께 받는다.
    const alias = id.replace(/^character_/, 'char_').replace(/^location_/, 'loc_')
    if (alias !== id) byId.set(alias, e.name.trim())
    const expanded = id.replace(/^char_/, 'character_').replace(/^loc_/, 'location_')
    if (expanded !== id) byId.set(expanded, e.name.trim())
  }
  if (byId.size === 0) return text

  // 토큰 경계: 앞뒤가 영숫자/언더바가 아닐 때만 — `char_30` 을 `char_3` 으로, `charcoal` 을 `char` 로 잘못 짚지 않게.
  //   긴 id 부터 하나의 정규식으로 잡는다(교대 순서 = 길이 내림차순).
  //   영어 낱말이기도 한 폴백 id(location·loc)는 한글이 바로 뒤따를 때만 id 로 본다 — "origin location of …" 의
  //   location 을 장소 이름으로 바꾸면 틀린 문장이 된다(겨울_7 sh_01_05 실측).
  const keys = [...byId.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)
  const re = new RegExp(`(?<![A-Za-z0-9_])(?:${keys.join('|')})(?![A-Za-z0-9_])`, 'gi')
  let out = text.replace(re, (token, offset: number, whole: string) => {
    const lower = token.toLowerCase()
    if (GENERIC_WORD_IDS.has(lower) && !/^[가-힣]/.test(whole.slice(offset + token.length))) return token // i18n-ok: 한글 범위 판정
    return byId.get(lower) ?? token
  })

  // 이름으로 치환하고 나면 "The father (Kai)" 처럼 동격 괄호가 남는다 — 앞말과 같은 대상을
  //   가리키는 군더더기라 괄호만 벗겨 문장을 자연스럽게 둔다. (이름이 들어간 괄호에만 적용)
  const names = new Set([...byId.values()])
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
