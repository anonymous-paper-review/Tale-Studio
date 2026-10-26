// 시리즈 다음 화의 Writer 시작 재료(2026-10-26) — 이어받은 인물 · 배경을 캐스트 · 배경 시드에 합치고, 앞 화 산문을 글로 만든다. 순수 함수.
//   writer/start 가 모든 시작 경로(산문 초안 · 다시 시도 · Artist [만들기] 이어 가기)에서 부른다 — 캐스트가 비어 와도 이어받은 인물이 빠지지 않는다.
import { displayNameOf } from '@/lib/display-name'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import type { CastContract, CastContractCharacter, PipelineInput } from '@/lib/writer/types/pipeline'
import type { SeriesSnapshot } from './snapshot'

/** writer/start 가 받는 Producer 배경 모양(라우트의 ProducerBackgrounds 와 같다). */
export interface SeriesBackgroundSeed {
  location_id: string
  name: string
  visual_description: string
  purpose?: string
  user_edited?: boolean
  source_image_url?: string
}

/** 이어받은 인물 → 캐스트 계약. 아크 · 동기는 이번 화에서 새로 정한다. */
export function seriesCastCharacters(series: SeriesSnapshot): CastContractCharacter[] {
  return series.characters.map((c) => ({
    character_id: c.characterId,
    name: c.name,
    entity_type: 'person' as const,
    role: c.role,
    appearance: c.appearance,
    ...(c.personality.length ? { personality: [...c.personality] } : {}),
  }))
}

/**
 * 캐스트에 이어받은 인물을 합친다. 같은 인물 번호가 이미 있으면 그 카드가 이기고(사람이 고친 값), 빈 외모 · 성격만 앞 화 값으로 채운다.
 *   없는 인물은 뒤에 붙인다 — 이번 화 산문에 안 나와도 캐스트에 남아 다음 화로 넘어간다.
 */
export function mergeSeriesCast<T extends CastContractCharacter>(cast: { characters: T[] } & Partial<Omit<CastContract, 'characters'>> | undefined, series: SeriesSnapshot | null): ({ characters: (T | CastContractCharacter)[] } & Partial<Omit<CastContract, 'characters'>>) | undefined {
  if (!series || series.characters.length === 0) return cast
  const inherited = new Map(seriesCastCharacters(series).map((c) => [c.character_id, c]))
  const characters: (T | CastContractCharacter)[] = (cast?.characters ?? []).map((c) => {
    const prev = inherited.get(c.character_id)
    if (!prev) return c
    inherited.delete(c.character_id)
    return {
      ...c,
      appearance: c.appearance?.trim() ? c.appearance : prev.appearance,
      ...(c.personality?.length ? {} : prev.personality ? { personality: prev.personality } : {}),
    }
  })
  return { ...(cast ?? {}), characters: [...characters, ...inherited.values()] }
}

/** 배경에 이어받은 배경을 합친다. 같은 배경 번호가 있으면 그 카드가 이기고 빈 설명만 채운다. */
export function mergeSeriesBackgrounds<T extends SeriesBackgroundSeed>(backgrounds: { locations: T[] } | undefined, series: SeriesSnapshot | null): { locations: (T | SeriesBackgroundSeed)[] } | undefined {
  if (!series || series.locations.length === 0) return backgrounds
  const inherited = new Map(series.locations.map((l) => [l.locationId, l]))
  const locations: (T | SeriesBackgroundSeed)[] = (backgrounds?.locations ?? []).map((l) => {
    const prev = inherited.get(l.location_id)
    if (!prev) return l
    inherited.delete(l.location_id)
    return { ...l, visual_description: l.visual_description?.trim() ? l.visual_description : prev.description }
  })
  for (const l of inherited.values()) {
    locations.push({ location_id: l.locationId, name: l.name, visual_description: l.description, purpose: '' })
  }
  return { locations }
}

interface ProseState {
  scenes?: { scenes?: Array<{ scene_actions?: unknown }> }
  characters?: { characters?: Array<{ id?: string; name?: string }> }
  world?: { locations?: Array<{ id?: string; name?: string }> }
  worldVisual?: { locations?: Array<{ id?: string; name?: string }> }
  dramaturgy?: { world_inventory?: Array<{ id?: string; name?: string }> } | null
}

/** 실행 상태의 산문 — 씬마다 scene_actions 를 줄글로 잇고 인물 · 장소 번호를 이름으로 바꾼다(Writer 미리보기와 같은 규칙). */
export function proseTextOf(state: ProseState | null | undefined, roster: Array<{ id: string; name: string }> = []): string {
  const scenes = state?.scenes?.scenes ?? []
  const entities: Array<{ id: string; name: string }> = []
  const seen = new Set<string>()
  const push = (rows: Array<{ id?: string; name?: string }> | undefined) => {
    for (const r of rows ?? []) {
      if (typeof r?.id !== 'string' || typeof r?.name !== 'string' || !r.id || !r.name || seen.has(r.id)) continue
      seen.add(r.id)
      entities.push({ id: r.id, name: displayNameOf(r.name, r.id) })
    }
  }
  push(state?.characters?.characters)
  push(state?.worldVisual?.locations)
  push(state?.world?.locations)
  push(roster)
  push(state?.dramaturgy?.world_inventory ?? undefined)
  return scenes
    .map((scene) => (Array.isArray(scene.scene_actions) ? scene.scene_actions : [])
      .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      .map((b) => resolveEntityNames(b, entities).trim())
      .join(' '))
    .filter(Boolean)
    .join('\n\n')
}

/** 파이프라인 입력의 시리즈 칸. 앞 화를 읽지 못했으면 prevProse 는 null 이다. */
export function seriesPipelineInput(series: SeriesSnapshot, prevProse: string | null): NonNullable<PipelineInput['series']> {
  return {
    prevTitle: series.prevTitle,
    prevProse: prevProse?.trim() ? prevProse.trim() : null,
    characters: series.characters.map((c) => c.name),
    locations: series.locations.map((l) => l.name),
  }
}
