// 트리트먼트 인물 · 장소 → Producer 캐스팅 · 배경 카드(2026-10-02 오너 — 시안 v04 "산문에서 장소를 읽어 배경 목록으로",
//   "Producer 에서 캐스팅 · 배경을 트리트먼트 위에"). 새 프로젝트는 만들자마자 트리트먼트를 쓰므로 카드가 비어 있다 —
//   트리트먼트가 부른 인물 · 장소를 카드(origin 'treatment')로 채운다. 빈 칸은 넘기기를 막지 않는다(producer-gate).
//   트리트먼트 버전마다 한 번만 맞춘다 — 사람이 지운 카드는 트리트먼트가 바뀌기 전까지 되살리지 않는다.
//   맞출 때 카드 내용의 지문(treatmentHash)을 남긴다 — 지문과 달라진 카드는 사람(화면 · 채팅)이 고친 카드라 덮어쓰거나 빼지 않는다.
import type { BackgroundSource, CastMember } from '@/lib/producer-gate'
import { stableHash } from '@/lib/stable-hash'

export interface TreatmentCast {
  characters: Array<{
    id: string
    name: string
    role: string
    entityType: 'person' | 'object'
    appearance: string
    arc?: { start_state?: string; end_state?: string; arc_type?: string }
    want: string
  }>
  locations: Array<{ id: string; name: string; description: string }>
}

interface Board {
  cast: CastMember[]
  backgrounds: BackgroundSource[]
  syncedVersion: string | null
}

const key = (name: string) => name.trim().toLowerCase()

const castHash = (c: Pick<CastMember, 'name' | 'entityType' | 'appearance' | 'role' | 'arc' | 'motivation'>) =>
  stableHash({ name: c.name, entityType: c.entityType, appearance: c.appearance, role: c.role ?? null, arc: c.arc ?? null, motivation: c.motivation ?? null })
const backgroundHash = (b: Pick<BackgroundSource, 'name' | 'visualDescription' | 'purpose'>) =>
  stableHash({ name: b.name, visualDescription: b.visualDescription, purpose: b.purpose })

/** 트리트먼트에서 온 카드를 사람이 손댔나 — 카드 편집 · 채팅 수정 · 그림 붙이기 어느 쪽이든. */
export function treatmentCardEdited(card: CastMember | BackgroundSource): boolean {
  if (card.origin !== 'treatment') return true
  if (card.userEdited || card.sourceImageUrl) return true
  const hash = 'entityType' in card ? castHash(card) : backgroundHash(card)
  return !!card.treatmentHash && hash !== card.treatmentHash
}

export function syncTreatmentCast(board: Board, treatment: TreatmentCast, version: string): Board {
  if (board.syncedVersion === version) return board

  const characterIds = new Set(treatment.characters.map((c) => c.id))
  // 트리트먼트에서 빠진 카드는 사람이 손대지 않았을 때만 함께 뺀다.
  const keptCast = board.cast.filter((c) => c.origin !== 'treatment' || treatmentCardEdited(c) || (c.characterId && characterIds.has(c.characterId)))
  const cast = keptCast.map((member) => {
    // 같은 이름의 카드가 먼저 있으면(그림으로 만든 카드 등) 트리트먼트 인물의 표시를 이어 붙인다 — 넘길 때 한 사람이 된다.
    if (!member.characterId) {
      const same = treatment.characters.find((c) => key(c.name) === key(member.name) && key(member.name))
      if (same) return { ...member, characterId: same.id }
    }
    if (member.origin !== 'treatment' || treatmentCardEdited(member)) return member
    const fresh = treatment.characters.find((c) => c.id === member.characterId)
    if (!fresh) return member
    const fields = castFields(fresh)
    return { ...member, ...fields, treatmentHash: castHash(fields) }
  })
  const castIds = new Set(cast.flatMap((c) => (c.characterId ? [c.characterId] : [])))
  const castNames = new Set(cast.map((c) => key(c.name)))
  for (const character of treatment.characters) {
    if (castIds.has(character.id) || castNames.has(key(character.name))) continue
    const fields = castFields(character)
    cast.push({ localId: `treatment:${character.id}`, characterId: character.id, origin: 'treatment', ...fields, treatmentHash: castHash(fields) })
    castNames.add(key(character.name))
  }

  const locationIds = new Set(treatment.locations.map((l) => l.id))
  const keptBackgrounds = board.backgrounds.filter((b) => b.origin !== 'treatment' || treatmentCardEdited(b) || (b.locationId && locationIds.has(b.locationId)))
  const backgrounds = keptBackgrounds.map((background) => {
    if (!background.locationId) {
      const same = treatment.locations.find((l) => key(l.name) === key(background.name) && key(background.name))
      if (same) return { ...background, locationId: same.id }
    }
    if (background.origin !== 'treatment' || treatmentCardEdited(background)) return background
    const fresh = treatment.locations.find((l) => l.id === background.locationId)
    if (!fresh) return background
    const next = { ...background, name: fresh.name, visualDescription: fresh.description }
    return { ...next, treatmentHash: backgroundHash(next) }
  })
  const backgroundIds = new Set(backgrounds.flatMap((b) => (b.locationId ? [b.locationId] : [])))
  const backgroundNames = new Set(backgrounds.map((b) => key(b.name)))
  for (const location of treatment.locations) {
    if (backgroundIds.has(location.id) || backgroundNames.has(key(location.name))) continue
    const card: BackgroundSource = { localId: `treatment:${location.id}`, locationId: location.id, name: location.name, visualDescription: location.description, purpose: '', origin: 'treatment' }
    backgrounds.push({ ...card, treatmentHash: backgroundHash(card) })
    backgroundNames.add(key(location.name))
  }

  return { cast, backgrounds, syncedVersion: version }
}

/** 넘길 때 Producer 카드로 싣는 것 — 손대지 않은 트리트먼트 카드는 빼고 Writer 가 자기 인물 · 장소로 채우게 둔다
 *  (빈 설명 · 목적이 Producer 원천으로 저장되면 Writer 가 다시 채우지 않는다). */
export function cardsForHandoff(board: { cast: CastMember[]; backgrounds: BackgroundSource[] }): { cast: CastMember[]; backgrounds: BackgroundSource[] } {
  return {
    cast: board.cast.filter(treatmentCardEdited),
    backgrounds: board.backgrounds.filter(treatmentCardEdited),
  }
}

function castFields(character: TreatmentCast['characters'][number]): Pick<CastMember, 'name' | 'entityType' | 'appearance' | 'role' | 'arc' | 'motivation'> {
  const arc = character.arc && (character.arc.start_state || character.arc.end_state || character.arc.arc_type)
    ? { start_state: character.arc.start_state ?? '', end_state: character.arc.end_state ?? '', arc_type: character.arc.arc_type ?? '' }
    : undefined
  return {
    name: character.name,
    entityType: character.entityType,
    appearance: character.appearance,
    role: character.role,
    arc,
    motivation: character.want ? { want: character.want } : undefined,
  }
}
