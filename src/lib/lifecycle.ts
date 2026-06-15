import type { StageId, ProjectSettings } from '@/types'
import { computeImageSourceHash } from '@/lib/image-provenance'

export type LifecycleEntityType = 'person' | 'object'

export interface ProducerSourceCastMember {
  localId?: string
  characterId?: string
  character_id?: string
  name?: string | null
  entityType?: LifecycleEntityType | string | null
  entity_type?: LifecycleEntityType | string | null
  role?: string | null
  appearance?: string | null
  voice?: string | null
  arc?: {
    start_state?: string | null
    end_state?: string | null
    arc_type?: string | null
  } | null
  motivation?: {
    want?: string | null
    need?: string | null
    wound?: string | null
  } | null
}

export interface ProducerSourceInput {
  storyText: string | null | undefined
  settings: Partial<ProjectSettings> | null | undefined
  cast: ProducerSourceCastMember[] | null | undefined
}

export type ProducerSourceImpactKind =
  | 'writerOutputStale'
  | 'artistImageStale'
  | 'writerReferencesMayRemain'

export interface ProducerSourceImpact {
  kind: ProducerSourceImpactKind
  target: string
  message: string
  characterId?: string
}

export interface EvaluateProducerSourceImpactInput {
  before: ProducerSourceInput
  after: ProducerSourceInput
  hasWriterOutput?: boolean
  selectedArtistImageCharacterIds?: string[]
  writerReferencedCharacterIds?: string[]
}

export interface LifecycleCharacter {
  characterId: string
  name?: string | null
  entityType?: LifecycleEntityType | string | null
  appearance?: string | null
  mainImageUrl?: string | null
  viewMain?: string | null
  selectedMainUrl?: string | null
}

export interface LifecycleWorldAsset {
  locationId: string
  name?: string | null
  wideShot?: string | null
  establishingShot?: string | null
}

export interface LifecycleGateIssue {
  field: string
  label: string
  detail?: string
  characterId?: string
}

export interface ArtistGateInput {
  characters: LifecycleCharacter[]
  /** Writer shot references when available. Empty/undefined falls back to Producer/person cast. */
  referencedCharacterIds?: string[] | null
  worlds?: LifecycleWorldAsset[] | null
  selectedDemoObjectIds?: string[] | null
}

export interface ArtistGateResult {
  ready: boolean
  requiredCharacterIds: string[]
  blockers: LifecycleGateIssue[]
  warnings: LifecycleGateIssue[]
}

export type WriterGateState = 'unknown' | 'active' | 'failed' | 'not_ready' | 'ready'

export interface WriterGateStatus {
  state: WriterGateState
  blockers?: LifecycleGateIssue[]
  details?: string[]
  producerSourceHash?: string | null
}

export interface DirectorGateResult {
  ready: boolean
  blockers: LifecycleGateIssue[]
  warnings: LifecycleGateIssue[]
}

export interface LifecycleStatus {
  producerSourceHash: string | null
  writer: WriterGateStatus
  artist: ArtistGateResult | null
  director: DirectorGateResult | null
}

export const UNKNOWN_WRITER_GATE_STATUS: WriterGateStatus = {
  state: 'unknown',
  blockers: [
    {
      field: 'writer:status',
      label: 'Writer 상태를 아직 확인할 수 없음',
      detail: 'Writer 개발자가 status/hash 계약을 제공하면 준비 여부를 계산합니다.',
    },
  ],
}

export const EMPTY_LIFECYCLE_STATUS: LifecycleStatus = {
  producerSourceHash: null,
  writer: UNKNOWN_WRITER_GATE_STATUS,
  artist: null,
  director: null,
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return values
    .map(normalizeText)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function castStableId(cast: ProducerSourceCastMember): string {
  return normalizeText(cast.characterId ?? cast.character_id)
    || normalizeText(cast.localId)
    || normalizeText(cast.name)
}

function normalizeEntityType(value: unknown): LifecycleEntityType {
  return value === 'object' ? 'object' : 'person'
}

function normalizeCastMember(cast: ProducerSourceCastMember) {
  const characterId = normalizeText(cast.characterId ?? cast.character_id)
  const localId = normalizeText(cast.localId)
  const name = normalizeText(cast.name)
  return {
    stableId: castStableId(cast),
    characterId,
    localId,
    name,
    entityType: normalizeEntityType(cast.entityType ?? cast.entity_type),
    role: normalizeText(cast.role),
    appearance: normalizeText(cast.appearance),
    voice: normalizeText(cast.voice),
    arc: {
      start_state: normalizeText(cast.arc?.start_state),
      end_state: normalizeText(cast.arc?.end_state),
      arc_type: normalizeText(cast.arc?.arc_type),
    },
    motivation: {
      want: normalizeText(cast.motivation?.want),
      need: normalizeText(cast.motivation?.need),
      wound: normalizeText(cast.motivation?.wound),
    },
  }
}

function normalizeProducerSource(input: ProducerSourceInput) {
  const settings = input.settings ?? {}
  const cast = (input.cast ?? [])
    .map(normalizeCastMember)
    .sort((a, b) => a.stableId.localeCompare(b.stableId))

  return {
    version: 1,
    storyText: normalizeText(input.storyText),
    settings: {
      playtime: typeof settings.playtime === 'number' ? settings.playtime : null,
      genre: normalizeText(settings.genre),
      subGenre: normalizeText(settings.subGenre),
      format: normalizeText(settings.format),
      tone: normalizeStringArray(settings.tone),
      targetEmotion: normalizeStringArray(settings.targetEmotion),
      dialogueLanguage: normalizeText(settings.dialogueLanguage),
    },
    cast,
  }
}

export function computeProducerSourceHash(input: ProducerSourceInput): string {
  return fnv1a(`producer-source:${stableStringify(normalizeProducerSource(input))}`)
}

function castMap(input: ProducerSourceInput): Map<string, ReturnType<typeof normalizeCastMember>> {
  const map = new Map<string, ReturnType<typeof normalizeCastMember>>()
  for (const cast of input.cast ?? []) {
    const normalized = normalizeCastMember(cast)
    if (normalized.stableId) map.set(normalized.stableId, normalized)
  }
  return map
}

export function evaluateProducerSourceImpact({
  before,
  after,
  hasWriterOutput = false,
  selectedArtistImageCharacterIds = [],
  writerReferencedCharacterIds = [],
}: EvaluateProducerSourceImpactInput): ProducerSourceImpact[] {
  const impacts: ProducerSourceImpact[] = []
  const beforeHash = computeProducerSourceHash(before)
  const afterHash = computeProducerSourceHash(after)

  if (hasWriterOutput && beforeHash !== afterHash) {
    impacts.push({
      kind: 'writerOutputStale',
      target: 'writer',
      message: 'Producer source changed; existing Writer scenes/shots may be stale.',
    })
  }

  const selectedSet = new Set(selectedArtistImageCharacterIds.filter(Boolean))
  const referencedSet = new Set(writerReferencedCharacterIds.filter(Boolean))
  const beforeCast = castMap(before)
  const afterCast = castMap(after)

  for (const [id, prev] of beforeCast) {
    const next = afterCast.get(id)
    const displayName = next?.name || prev.name || id

    if (!next) {
      if (referencedSet.has(id)) {
        impacts.push({
          kind: 'writerReferencesMayRemain',
          target: displayName,
          characterId: id,
          message: `${displayName} is referenced by Writer output; deletion may leave stale references until Writer reruns.`,
        })
      }
      continue
    }

    if (selectedSet.has(id) && computeImageSourceHash(prev.appearance) !== computeImageSourceHash(next.appearance)) {
      impacts.push({
        kind: 'artistImageStale',
        target: displayName,
        characterId: id,
        message: `${displayName} appearance changed; selected Artist image may be stale.`,
      })
    }

    const identityChanged = prev.name !== next.name || prev.entityType !== next.entityType || prev.role !== next.role
    if (identityChanged && referencedSet.has(id)) {
      impacts.push({
        kind: 'writerReferencesMayRemain',
        target: displayName,
        characterId: id,
        message: `${displayName} identity changed while Writer output references it; rerun may be needed.`,
      })
    }
  }

  return impacts
}

function hasMainImage(character: LifecycleCharacter): boolean {
  return Boolean(
    normalizeText(character.mainImageUrl)
      || normalizeText(character.viewMain)
      || normalizeText(character.selectedMainUrl),
  )
}

function hasUsableAppearance(character: LifecycleCharacter): boolean {
  return normalizeText(character.appearance).length > 0
}

export function evaluateArtistGate({
  characters,
  referencedCharacterIds,
  worlds = [],
  selectedDemoObjectIds = [],
}: ArtistGateInput): ArtistGateResult {
  const byId = new Map(characters.map((character) => [character.characterId, character]))
  const referenceIds = [...new Set((referencedCharacterIds ?? []).filter(Boolean))]
  const selectedObjectSet = new Set((selectedDemoObjectIds ?? []).filter(Boolean))
  const requiredCharacterIds = referenceIds.length > 0
    ? referenceIds.filter((id) => normalizeEntityType(byId.get(id)?.entityType) !== 'object')
    : characters
        .filter((character) => normalizeEntityType(character.entityType) !== 'object' && hasUsableAppearance(character))
        .map((character) => character.characterId)

  const blockers: LifecycleGateIssue[] = []
  const warnings: LifecycleGateIssue[] = []

  for (const id of requiredCharacterIds) {
    const character = byId.get(id)
    if (!character) {
      blockers.push({
        field: `artist:${id}:missing`,
        characterId: id,
        label: `필수 캐릭터 ${id} 없음`,
      })
      continue
    }
    if (!hasMainImage(character)) {
      blockers.push({
        field: `artist:${id}:mainImage`,
        characterId: id,
        label: `${character.name || id}: main 이미지 필요`,
      })
    }
  }

  for (const character of characters) {
    if (normalizeEntityType(character.entityType) !== 'object') continue
    if (hasMainImage(character)) continue
    const selected = selectedObjectSet.has(character.characterId)
    warnings.push({
      field: `artist:${character.characterId}:objectImage`,
      characterId: character.characterId,
      label: `${character.name || character.characterId}: object 이미지 없음`,
      detail: selected ? '선택 demo shot이 참조하면 Director 품질/게이트에 영향을 줄 수 있습니다.' : 'MVP 기본 경로에서는 경고입니다.',
    })
  }

  for (const world of worlds ?? []) {
    if (!normalizeText(world.wideShot)) {
      warnings.push({
        field: `artist:${world.locationId}:wideShot`,
        label: `${world.name || world.locationId}: wide shot 없음`,
        detail: 'Director 보조 이미지이며 MVP 기본 경로에서는 경고입니다.',
      })
    }
    if (!normalizeText(world.establishingShot)) {
      warnings.push({
        field: `artist:${world.locationId}:establishingShot`,
        label: `${world.name || world.locationId}: establishing shot 없음`,
        detail: 'Director 보조 이미지이며 MVP 기본 경로에서는 경고입니다.',
      })
    }
  }

  return {
    ready: blockers.length === 0,
    requiredCharacterIds,
    blockers,
    warnings,
  }
}

export function evaluateDirectorGate({
  writer,
  artist,
}: {
  writer?: WriterGateStatus | null
  artist?: ArtistGateResult | null
}): DirectorGateResult {
  const blockers: LifecycleGateIssue[] = []
  const warnings: LifecycleGateIssue[] = []
  const writerStatus = writer ?? UNKNOWN_WRITER_GATE_STATUS

  if (writerStatus.state !== 'ready') {
    blockers.push(
      ...(writerStatus.blockers?.length
        ? writerStatus.blockers
        : [{ field: 'writer:status', label: `Writer gate not ready: ${writerStatus.state}` }]),
    )
  }

  if (!artist) {
    blockers.push({ field: 'artist:status', label: 'Artist 준비 상태를 아직 계산하지 않음' })
  } else {
    blockers.push(...artist.blockers)
    warnings.push(...artist.warnings)
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  }
}

export function furtherUnlockedStage(current: StageId, target: StageId, stages: readonly { id: StageId }[]): StageId {
  const currentIndex = stages.findIndex((stage) => stage.id === current)
  const targetIndex = stages.findIndex((stage) => stage.id === target)
  if (targetIndex < 0) return current
  if (currentIndex < 0) return target
  return targetIndex > currentIndex ? target : current
}
