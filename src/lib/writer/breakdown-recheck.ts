// 산문 재점검 반영(2026-10-27 오너 · 디자이너 QA 2차, 프로토타입 WT [목록에 반영]) — 창에서 고친 것을 Writer 실행 기록과
//   브레이크다운 목록(producer_draft)에 같은 표시로 얹는다. 순수 함수 — 저장은 /api/writer/breakdown-recheck 가 한다.
//   왜 실행 기록까지: [만들기]는 확정 산문 초안의 실행을 이어 가며 그 기록의 인물 · 장소를 디자인하고 그린다. 목록만 고치면
//   합친 인물이 다시 그려지고(트리트먼트 인물은 넘길 때 지워지지 않는다), 새 인물은 어느 씬에도 없어 샷에 나오지 않는다.
//   - 새 인물은 산문에서 그 인물로 표시되는 말이 있는 씬마다 넣는다(오너 결정 1). 새 장소는 목록에만 넣고 씬 장소는 그대로다(오너 결정 2).
//   - 합치면 사라지는 쪽을 가리키던 씬 · 대사 · 씬별 모습 · 관계를 남는 쪽으로 옮기고 사라지는 쪽은 기록에서 뺀다.
//   - 산문 글(scene_actions)은 손대지 않는다.
//   약속: tests/artist/recheck-apply.test.ts
import { slugifyIdentifier } from '@/lib/cast-slug'
import { displayNameOf } from '@/lib/display-name'
import { backgroundHash, castHash, treatmentCardEdited } from '@/lib/producer/treatment-cast-sync'
import type { BackgroundSource, CastMember } from '@/lib/producer-gate'
import { replaceSlugs } from '@/lib/script-lines'
import { applyRecheckOps, markMentions, recheckBase, type ProseScene, type RecheckEntry, type RecheckIssue, type RecheckOp } from '@/lib/artist/recheck'
import { mergeOpenWorld } from '@/lib/writer/pipeline/stages/s3_scenes'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import type { BackgroundContract, StoryCharacter } from '@/lib/writer/types/pipeline'

export type BreakdownRecheckBlock = 'breakdown_closed' | 'prose_not_locked' | 'prose_missing'

/** 지금 재점검을 반영할 수 없는 까닭 — 없으면 반영한다. 산문을 확정했고([브레이크다운하기]) [만들기] 전인 산문 초안 실행이어야 한다. */
export function breakdownRecheckBlock(run: { status: string; state: unknown } | null | undefined): BreakdownRecheckBlock | null {
  if (!run || run.status !== 'awaiting_confirmation') return 'breakdown_closed'
  const state = run.state as WriterRunState | null | undefined
  if (state?.input?.treatmentDraft !== true) return 'breakdown_closed'
  if (state._proseLocked !== true) return 'prose_not_locked'
  if (!state.scenes?.scenes?.length) return 'prose_missing'
  return null
}

function rosterOf(state: WriterRunState): Array<{ slug: string; name: string }> {
  const roster: Array<{ slug: string; name: string }> = []
  const seen = new Set<string>()
  const push = (rows: ReadonlyArray<{ id?: string; name?: string }> | undefined) => {
    for (const row of rows ?? []) {
      if (typeof row?.id !== 'string' || typeof row?.name !== 'string' || !row.id || !row.name || seen.has(row.id)) continue
      seen.add(row.id)
      roster.push({ slug: row.id, name: displayNameOf(row.name, row.id) })
    }
  }
  // 미리 보기(/api/writer/preview)와 같은 순서 — 산문 초안 단계에는 인물 · 장소 표가 아직 비어 있어 실행 기록만으로 같다.
  push(state.characters?.characters)
  push(state.worldVisual?.locations)
  push(state.world?.locations)
  push(state.dramaturgy?.world_inventory)
  return roster
}

/** Writer 화면 · 재점검 창과 같은 산문(S1 · S2 …) — 씬 비트의 번호를 이름으로 바꿔 이어 붙인다. */
export function proseScenesOfState(state: WriterRunState): ProseScene[] {
  const roster = rosterOf(state)
  const entities = roster.map((entry) => ({ id: entry.slug, name: entry.name }))
  return (state.scenes?.scenes ?? []).flatMap((scene) => {
    const beats = (Array.isArray(scene.scene_actions) ? scene.scene_actions : [])
      .filter((beat): beat is string => typeof beat === 'string' && !!beat.trim())
      .map((beat) => resolveEntityNames(beat, entities))
    return beats.length ? [{ sceneId: scene.scene_id, text: replaceSlugs(beats.join(' '), roster, '') }] : []
  })
}

/** producer_draft(jsonb) 의 목록. 형태가 안 맞으면 null. 카드의 다른 칸은 그대로 지닌다. */
export function draftLists(raw: unknown): { cast: CastMember[]; backgrounds: BackgroundSource[] } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const draft = raw as { cast?: unknown; backgrounds?: unknown }
  if (!Array.isArray(draft.cast) || !Array.isArray(draft.backgrounds)) return null
  const isCard = (card: unknown) => !!card && typeof card === 'object' && typeof (card as { localId?: unknown }).localId === 'string'
  return { cast: draft.cast.filter(isCard) as CastMember[], backgrounds: draft.backgrounds.filter(isCard) as BackgroundSource[] }
}

const nameKey = (name: string | undefined) => (name ?? '').trim().toLowerCase()
const unique = <T,>(items: readonly T[]) => [...new Set(items)]

/** 산문 초안의 장소 — 실행 기록에 장소 목록이 없으면(대본 보존 초안) 씬에 적힌 장소로 대신한다(미리 보기와 같은 규칙). */
function draftLocations(state: WriterRunState): BackgroundContract['locations'] {
  if (state.world?.locations?.length) return state.world.locations.map((location) => ({ ...location }))
  return state.scenes ? mergeOpenWorld(undefined, state.scenes).locations : []
}

/** 새 번호 — 실행 기록 · 목록의 어떤 번호와도 겹치지 않게(한글 이름은 char · location 으로 바뀌어 겹치기 쉽다). */
function idMaker(state: WriterRunState, cast: readonly CastMember[], backgrounds: readonly BackgroundSource[]) {
  const used = new Set<string>()
  const use = (id: unknown) => {
    if (typeof id === 'string' && id.trim()) used.add(id.trim().toLowerCase())
  }
  for (const character of state.characters?.characters ?? []) use(character.id)
  for (const character of state.scenes?.new_characters ?? []) use(character.id)
  for (const scene of state.scenes?.scenes ?? []) use(scene.location)
  for (const location of state.world?.locations ?? []) use(location.id)
  for (const location of state.worldVisual?.locations ?? []) use(location.id)
  for (const card of cast) use(card.characterId)
  for (const card of backgrounds) use(card.locationId)
  // 이야기 엔진의 장소 후보 번호는 산문 이름 바꾸기 목록에 들어 있다 — 새 번호로는 쓰지 않는다(그 후보 자신을 넣을 때만 쓴다).
  const reserved = new Set((state.dramaturgy?.world_inventory ?? []).map((candidate) => candidate.id.trim().toLowerCase()))
  return {
    isUsed: (id: string) => used.has(id.trim().toLowerCase()),
    claim: (id: string) => {
      use(id)
      return id
    },
    fresh: (name: string, fallback: string) => {
      const base = slugifyIdentifier(name, fallback)
      let id = base
      for (let n = 2; used.has(id.toLowerCase()) || reserved.has(id.toLowerCase()); n++) id = `${base}_${n}`
      use(id)
      return id
    },
  }
}

function newCharacter(id: string, name: string): StoryCharacter {
  return {
    id,
    name,
    entity_type: 'person',
    role: 'supporting',
    personality: [],
    arc: { start_state: '', end_state: '', arc_type: '' },
    // 외형은 비워 둔다 — [만들기]의 인물 디자인이 채운다(프로토타입 "설명은 AI가 산문을 읽고 채워요").
    appearance_description: '',
    motivation: { want: '', need: '' },
  }
}

/** 사라지는 인물(from)을 가리키던 곳을 남는 인물(to)로 — 씬 등장 · 대사 · 씬별 모습 · 관계. 그리고 기록에서 뺀다. */
function mergeCharacterInto(state: WriterRunState, from: string, to: string): void {
  for (const scene of state.scenes?.scenes ?? []) {
    if (Array.isArray(scene.characters_in_scene)) scene.characters_in_scene = unique(scene.characters_in_scene.map((id) => (id === from ? to : id)))
    for (const line of scene.key_dialogue ?? []) if (line.character_id === from) line.character_id = to
    const overrides = scene.character_appearance_overrides
    if (overrides && from in overrides) {
      if (!(to in overrides)) overrides[to] = overrides[from]
      delete overrides[from]
    }
  }
  if (state.scenes?.new_characters) state.scenes.new_characters = state.scenes.new_characters.filter((character) => character.id !== from)
  if (state.characters) {
    state.characters.characters = state.characters.characters.filter((character) => character.id !== from)
    state.characters.relationships = (state.characters.relationships ?? [])
      .map((relationship) => ({ ...relationship, between: relationship.between.map((id) => (id === from ? to : id)) as [string, string] }))
      .filter((relationship) => relationship.between[0] !== relationship.between[1])
  }
}

/** 고친 줄의 카드 — 이름 · 다른 이름 · 기록 번호만 바꾸고 나머지(설명 · 그림 · 표시)는 그대로다.
 *  손대지 않은 산문 카드는 지문을 새 이름으로 맞춰 손대지 않은 카드로 남긴다 — [만들기] 때 Writer 가 고친 실행 기록으로 이어 간다. */
function updatedCard<T extends CastMember | BackgroundSource>(card: T, entry: RecheckEntry, runId: string | null, hash: (card: T) => string): T {
  const untouched = card.origin === 'treatment' && !treatmentCardEdited(card)
  const next: T = { ...card, name: entry.name }
  if (entry.aliases.length) next.aliases = [...entry.aliases]
  else delete next.aliases
  if (runId) {
    if ('entityType' in next) (next as CastMember).characterId = runId
    else (next as BackgroundSource).locationId = runId
  }
  if (untouched && next.name !== card.name) next.treatmentHash = hash(next)
  return next
}

export type BreakdownRecheckPlan =
  | { ok: true; state: WriterRunState; cast: CastMember[]; backgrounds: BackgroundSource[]; newLocalIds: string[] }
  | { ok: false; code: RecheckIssue }

export function planBreakdownRecheck(input: {
  state: WriterRunState
  cast: readonly CastMember[]
  backgrounds: readonly BackgroundSource[]
  ops: readonly RecheckOp[]
}): BreakdownRecheckPlan {
  const prose = proseScenesOfState(input.state)
  const base = recheckBase(input.cast, input.backgrounds)
  const applied = applyRecheckOps(base, input.ops, prose)
  if (!applied.ok) return { ok: false, code: applied.issue }
  const entries = applied.entries

  const state = structuredClone(input.state)
  const ids = idMaker(state, input.cast, input.backgrounds)
  const cards = new Map<string, CastMember | BackgroundSource>([...input.cast, ...input.backgrounds].map((card) => [card.localId, card]))
  const baseName = new Map(base.map((entity) => [entity.key, entity.name]))
  const touched = (entry: RecheckEntry) => entry.added || entry.merged.length > 0 || entry.name !== baseName.get(entry.key)
  const composing = (entry: RecheckEntry) => [entry.key, ...entry.merged].flatMap((key) => (cards.has(key) ? [cards.get(key)!] : []))
  const newLocalIds: string[] = []

  // ── 인물 ──
  // 카드 ↔ 기록 인물은 고치기 전 기록으로 맞춘다(번호 먼저, 없으면 같은 이름). 사물은 목록에 없어 맞추지 않는다.
  const persons = (state.characters?.characters ?? []).filter((character) => character.entity_type !== 'object')
  const personRunId = (card: CastMember | BackgroundSource): string | null => {
    const member = card as CastMember
    if (member.characterId && persons.some((character) => character.id === member.characterId)) return member.characterId
    const key = nameKey(member.name)
    return key ? persons.find((character) => nameKey(character.name) === key)?.id ?? null : null
  }
  const personRunIds = new Map(input.cast.map((card) => [card.localId, personRunId(card)]))
  const personUpdates = new Map<string, CastMember>()
  const freshPersons: Array<{ key: string; id: string }> = []
  const newCast: CastMember[] = []
  for (const entry of entries.filter((item) => item.kind === 'person')) {
    const parts = composing(entry) as CastMember[]
    const runIds = unique(parts.map((card) => personRunIds.get(card.localId)).filter((id): id is string => !!id))
    const source = parts[0]
    if (!source) {
      const id = ids.fresh(entry.name, 'char')
      state.characters ??= { characters: [], relationships: [], subtext_notes: [] }
      state.characters.characters.push(newCharacter(id, entry.name))
      freshPersons.push({ key: entry.key, id })
      const fields = { name: entry.name, entityType: 'person' as const, appearance: '', role: 'supporting' }
      const card: CastMember = { localId: `recheck:${id}`, characterId: id, origin: 'treatment', ...fields, ...(entry.aliases.length ? { aliases: [...entry.aliases] } : {}), treatmentHash: castHash(fields) }
      newCast.push(card)
      newLocalIds.push(card.localId)
      continue
    }
    const targetId = runIds[0] ?? null
    if (targetId) {
      for (const other of runIds.slice(1)) mergeCharacterInto(state, other, targetId)
      const character = state.characters?.characters.find((item) => item.id === targetId)
      if (character && touched(entry)) character.name = entry.name
    }
    personUpdates.set(source.localId, updatedCard(source, entry, targetId, castHash))
  }

  // ── 장소 ──
  const places = entries.filter((item) => item.kind === 'background')
  const locations = draftLocations(state)
  const placeRunId = (card: CastMember | BackgroundSource): string | null => {
    const background = card as BackgroundSource
    if (background.locationId && locations.some((location) => location.id === background.locationId)) return background.locationId
    const key = nameKey(background.name)
    return key ? locations.find((location) => nameKey(location.name) === key)?.id ?? null : null
  }
  const placeRunIds = new Map([...input.backgrounds].map((card) => [card.localId, placeRunId(card)]))
  const placeUpdates = new Map<string, BackgroundSource>()
  const newBackgrounds: BackgroundSource[] = []
  let worldChanged = false
  for (const entry of places) {
    const parts = composing(entry) as BackgroundSource[]
    const runIds = unique(parts.map((card) => placeRunIds.get(card.localId)).filter((id): id is string => !!id))
    const source = parts[0]
    if (!source) {
      // 이야기 엔진이 적어 둔 장소 후보와 같은 이름이면 그 번호 · 설명을 이어받는다 — 배경 디자인이 산문에 맞는 재료를 받는다.
      const candidate = (state.dramaturgy?.world_inventory ?? []).find((item) => nameKey(item.name) === nameKey(entry.name))
      const id = candidate && !ids.isUsed(candidate.id) ? ids.claim(candidate.id) : ids.fresh(entry.name, 'location')
      const description = candidate?.description ?? ''
      locations.push({ id, name: entry.name, description })
      worldChanged = true
      const card: BackgroundSource = { localId: `recheck:${id}`, locationId: id, name: entry.name, visualDescription: description, purpose: '', origin: 'treatment', ...(entry.aliases.length ? { aliases: [...entry.aliases] } : {}) }
      card.treatmentHash = backgroundHash(card)
      newBackgrounds.push(card)
      newLocalIds.push(card.localId)
      continue
    }
    const targetId = runIds[0] ?? null
    if (targetId) {
      for (const other of runIds.slice(1)) {
        for (const scene of state.scenes?.scenes ?? []) if (scene.location === other) scene.location = targetId
        const at = locations.findIndex((location) => location.id === other)
        if (at >= 0) locations.splice(at, 1)
        worldChanged = true
      }
      const location = locations.find((item) => item.id === targetId)
      if (location && touched(entry) && location.name !== entry.name) {
        location.name = entry.name
        worldChanged = true
      }
    }
    placeUpdates.set(source.localId, updatedCard(source, entry, targetId, backgroundHash))
  }
  if (worldChanged) state.world = { ...(state.world ?? {}), locations }

  // 새 인물은 산문에서 그 인물로 표시되는 말이 있는 씬마다 넣는다(오너 결정 1 — 대사에만 이름이 나오는 씬도 받아들였다).
  for (const { key, id } of freshPersons) {
    for (const scene of prose) {
      if (!markMentions(scene.text, entries).some((segment) => segment.key === key)) continue
      const target = state.scenes?.scenes.find((item) => item.scene_id === scene.sceneId)
      if (target && Array.isArray(target.characters_in_scene) && !target.characters_in_scene.includes(id)) target.characters_in_scene = [...target.characters_in_scene, id]
    }
  }

  // 목록 순서는 그대로 — 합쳐 사라진 줄만 빠지고, 새 줄은 끝에 붙는다. 사물 카드는 손대지 않는다.
  const cast = [
    ...input.cast.flatMap((card) => (card.entityType === 'object' ? [card] : personUpdates.has(card.localId) ? [personUpdates.get(card.localId)!] : [])),
    ...newCast,
  ]
  const backgrounds = [
    ...input.backgrounds.flatMap((card) => (placeUpdates.has(card.localId) ? [placeUpdates.get(card.localId)!] : [])),
    ...newBackgrounds,
  ]
  return { ok: true, state, cast, backgrounds, newLocalIds }
}
