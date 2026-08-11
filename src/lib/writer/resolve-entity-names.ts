// 설명문에 새어 나온 엔티티 id 를 사람 이름으로 바꾼다 (#id-leak 2026-08-11).
//
// 실측(프로덕션 shots.action_description):
//   "The father (char_3) waves his arms at nearby workers…"
//   "char_3 steps into the narrow observation station."
//   "Beyond the horizon, the silhouette of location_2 appears…"
// 파이프라인이 산문 안에 id 를 그대로 쓰는 경우가 있다. 사람이 읽는 화면에서는 이름이어야 한다.
//
// 여기는 **표시 계층 처방**이다 — 저장된 값은 건드리지 않는다. 근본 처방(상류가 산문에 이름을
//   쓰게 하는 것)은 프롬프트 변경 + 전량 재생성이 필요하고, 같은 문장이 이미지 생성 프롬프트로도
//   흘러가므로 품질 회귀 검증이 따라붙는다 — 별건으로 분리한다.
//
// 매칭 규칙: id 는 `char_3`·`character_3`·`location_2`·`loc_2` 꼴로만 인식한다. 맨몸 "Char"
//   (모델이 이름 대신 쓴 것)는 **건드리지 않는다** — 어느 인물인지 알 수 없어 추측하면 틀린 이름을
//   보여주게 된다. 틀린 이름은 안 고친 id 보다 나쁘다.

interface NamedEntity {
  id: string
  name: string
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
    byId.set(e.id.toLowerCase(), e.name.trim())
    // `char_3` 로 저장돼 있어도 실제 id 가 `character_3` 인(혹은 그 반대인) 경우를 함께 받는다.
    const alias = e.id.toLowerCase().replace(/^character_/, 'char_').replace(/^location_/, 'loc_')
    if (alias !== e.id.toLowerCase()) byId.set(alias, e.name.trim())
    const expanded = e.id.toLowerCase().replace(/^char_/, 'character_').replace(/^loc_/, 'location_')
    if (expanded !== e.id.toLowerCase()) byId.set(expanded, e.name.trim())
  }
  if (byId.size === 0) return text

  // 토큰 경계: 앞뒤가 영숫자/언더바가 아닐 때만 — `char_30` 을 `char_3` 으로 잘못 짚지 않게.
  let out = text.replace(/\b(?:char|character|loc|location)_[A-Za-z0-9]+\b/gi, (token) => {
    return byId.get(token.toLowerCase()) ?? token
  })

  // 이름으로 치환하고 나면 "The father (Kai)" 처럼 동격 괄호가 남는다 — 앞말과 같은 대상을
  //   가리키는 군더더기라 괄호만 벗겨 문장을 자연스럽게 둔다. (이름이 들어간 괄호에만 적용)
  const names = new Set([...byId.values()])
  out = out.replace(/\s*\(([^()]{1,40})\)/g, (whole, inner: string) =>
    names.has(inner.trim()) ? '' : whole,
  )

  return out
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
