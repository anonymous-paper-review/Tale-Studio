import type { StageId, ProjectSettings } from '@/types'
import { computeImageSourceHash } from '@/lib/image-provenance'
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'

// evaluateArtistGate/evaluateDirectorGate 호출부(studio/artist/page.tsx — 범위 밖)가 아직 locale 을
//   안 넘긴다. 안 넘기는 호출부가 조용히 깨지지 않도록 기존 동작(항상 한국어)을 기본값으로
//   보존한다(producer-gate.ts와 동일 취급 — 이 파일은 그 사촌 게이트 모듈).
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

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

export interface ProducerSourceBackground {
  localId?: string
  locationId?: string
  location_id?: string
  name?: string | null
  visualDescription?: string | null
  visual_description?: string | null
  purpose?: string | null
  origin?: 'producer' | 'writer' | string | null
}

export interface ProducerSourceInput {
  storyText: string | null | undefined
  settings: Partial<ProjectSettings> | null | undefined
  cast: ProducerSourceCastMember[] | null | undefined
  backgrounds?: ProducerSourceBackground[] | null | undefined
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
  /** GateIssue.label/detail 번역에 쓰는 로케일. 미지정이면 기존 동작(한국어) 유지. */
  locale?: AppLocale
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
      // project-store.ts(범위 밖)가 이 상수를 초기값으로 직접 참조(함수 호출이 아니다) — locale 인자를
      //   받을 수 없어 항상 UNSPECIFIED_LOCALE_FALLBACK 으로 완역한다(기존 동작과 byte-identical).
      label: translate(UNSPECIFIED_LOCALE_FALLBACK, "Writer status can't be checked yet"),
      detail: translate(
        UNSPECIFIED_LOCALE_FALLBACK,
        'Readiness will be computed once the Writer developer provides the status/hash contract.',
      ),
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
    || normalizeText(cast.name)
    || normalizeText(cast.localId)
}

function normalizeEntityType(value: unknown): LifecycleEntityType {
  return value === 'object' ? 'object' : 'person'
}

function normalizeCastMember(cast: ProducerSourceCastMember) {
  const characterId = normalizeText(cast.characterId ?? cast.character_id)
  const name = normalizeText(cast.name)
  return {
    stableId: castStableId(cast),
    characterId,
    localId: '',
    name,
    entityType: normalizeEntityType(cast.entityType ?? cast.entity_type),
    role: normalizeText(cast.role),
    appearance: normalizeText(cast.appearance),
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

function backgroundStableId(background: ProducerSourceBackground): string {
  return normalizeText(background.locationId ?? background.location_id)
    || normalizeText(background.name)
    || normalizeText(background.localId)
}

function normalizeBackground(background: ProducerSourceBackground) {
  return {
    stableId: backgroundStableId(background),
    locationId: normalizeText(background.locationId ?? background.location_id),
    localId: '',
    name: normalizeText(background.name),
    visualDescription: normalizeText(background.visualDescription ?? background.visual_description),
    purpose: normalizeText(background.purpose),
    origin: normalizeText(background.origin),
  }
}

function normalizeProducerSource(input: ProducerSourceInput) {
  const settings = input.settings ?? {}
  const cast = (input.cast ?? [])
    .map(normalizeCastMember)
    .sort((a, b) => a.stableId.localeCompare(b.stableId))
    .map(({ stableId: _stableId, ...member }) => member)
  const backgrounds = (input.backgrounds ?? [])
    .map(normalizeBackground)
    .sort((a, b) => a.stableId.localeCompare(b.stableId))
    .map(({ stableId: _stableId, ...background }) => background)

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
    backgrounds,
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

    // F4: appearance 델타 감지 전용(룩 무관) — lookFingerprint 미전달로 레거시 appearance-only 자기비교 유지.
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
  locale = UNSPECIFIED_LOCALE_FALLBACK,
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
        label: translate(locale, 'Required character {id} missing', { id }),
      })
      continue
    }
    if (!hasMainImage(character)) {
      blockers.push({
        field: `artist:${id}:mainImage`,
        characterId: id,
        label: translate(locale, '{who}: main image needed', { who: character.name || id }),
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
      label: translate(locale, '{who}: no object image', { who: character.name || character.characterId }),
      detail: selected
        ? translate(locale, 'If a selected demo shot references this, it may affect Director quality/gates.')
        : translate(locale, 'This is a warning on the MVP default path.'),
    })
  }

  for (const world of worlds ?? []) {
    // 배경 = 이미지 1장(#6·#9): wide 만 확인. establishing 경고 폐기.
    if (!normalizeText(world.wideShot)) {
      warnings.push({
        field: `artist:${world.locationId}:wideShot`,
        label: translate(locale, '{who}: no background image', { who: world.name || world.locationId }),
        detail: translate(locale, 'This is a supporting image for Director and is a warning on the MVP default path.'),
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
  locale = UNSPECIFIED_LOCALE_FALLBACK,
}: {
  writer?: WriterGateStatus | null
  artist?: ArtistGateResult | null
  locale?: AppLocale
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
    blockers.push({ field: 'artist:status', label: translate(locale, "Artist readiness hasn't been calculated yet") })
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
