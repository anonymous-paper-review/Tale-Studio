// 실사 스토리보드의 참조 이미지 계획 — 서버 진실(DB)로 인물 시트·배경을 붙이고, 빠진 시트는 막는다.
//
// 왜 필요한가(#ref-gate 2026-09-02, 실측 겨울_4 9ea9bd67): 단건 strip 라우트는 클라이언트가 보낸 URL 만
//   믿었다. 인물 시트가 아직 생성 중이면 클라는 그 인물을 소리 없이 빼고 보냈고(pickAssetImageUrl null),
//   서버는 shots.characters(3명)와 받은 참조 수(0)를 대조하지 않아 목각 인형이 그대로 렌더됐다.
//   시트가 1장뿐인 샷은 "모든 인형을 해당 인물로" 지시를 받아 세 인형이 전부 같은 인물이 됐다.
//
// 계약:
//   - shots.characters 가 배열이면 그 인물 전원의 시트가 있어야 생성한다. 하나라도 없으면
//     MissingCharacterSheetsError(409, code 'missing_character_sheets') — 사람이 읽을 이름 목록 동봉.
//   - 참조 순서는 결정적(characterId 오름차순) — 프롬프트의 "reference image N = 이름" 규약이 성립하려면
//     순서가 흔들리면 안 된다(배치 그리드와 같은 규약).
//   - 인형↔인물 대응은 static_spec.character_blocking 의 position_in_frame/pose 로 준다.
//   - 배경은 씬 로케이션의 wide_shot(있으면). 없으면 null — 프롬프트가 "환경 불변" 절로 대신한다.
//     씬→로케이션 연결은 scenes.location(= locations.location_id) 이 진실이다(writer persist 가 그렇게 쓴다).
//     locations.scene_id 는 실측 전 프로젝트에서 null(겨울_4 4/4) — 그 컬럼만 보던 배치 그리드는 배경을 한 번도
//     못 붙였다. 여기서는 scenes.location 우선, locations.scene_id 폴백.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyDirectorRefs, directorRefsExcludeWorld, parseDirectorRefs } from '@/lib/director/director-refs'

export { applyDirectorRefs, directorRefsExcludeWorld, parseDirectorRefs, type DirectorRefs } from '@/lib/director/director-refs'

export const MISSING_CHARACTER_SHEETS = 'missing_character_sheets' as const

export interface ShotCharacterRef {
  characterId: string
  appearanceKey: string
  /** 표시명(characters.name) — 프롬프트의 "reference image N = 이름" */
  name: string
  url: string
  /** static_spec.character_blocking.position_in_frame (예: left_third) — 없으면 null */
  position: string | null
  /** static_spec.character_blocking.pose — 없으면 null */
  pose: string | null
}

export interface MissingSheet {
  characterId: string
  appearanceKey: string
  name: string
}

export interface ShotReferencePlan {
  characterRefs: ShotCharacterRef[]
  missing: MissingSheet[]
  /** 씬 로케이션 wide_shot — 없으면 null */
  worldRef: string | null
}

export class MissingCharacterSheetsError extends Error {
  readonly code = MISSING_CHARACTER_SHEETS
  constructor(
    readonly shotId: string,
    readonly missing: MissingSheet[],
  ) {
    super(missingSheetsMessage(missing))
    this.name = 'MissingCharacterSheetsError'
  }
}

/** 사람이 읽는 한 줄 — t() 키는 클라이언트가 code 로 다시 만들고, 이 문장은 로그·폴백용. */
export function missingSheetsMessage(missing: MissingSheet[]): string {
  const names = missing.map((m) => m.name).join(', ')
  return `Character sheets are missing for ${names} — generate them in the Artist tab first.`
}

export interface ShotRowForReferences {
  shot_id: string
  scene_id?: string | null
  characters?: unknown
  character_appearance_keys?: unknown
  static_spec?: unknown
  /** 약속 F·G(2026-09-04): Director 에서 사람이 손댄 참조 목록(shots.director_refs). null = Writer 그대로. */
  director_refs?: unknown
}


export interface ReferenceLookup {
  /** characters.character_id → { name } */
  characterById: Map<string, { name: string }>
  /** `${characterId}\u0000${appearanceKey}` → sheet_url(null 가능) */
  sheetByPair: Map<string, string | null>
  /** characterId → 기본 모습 appearance_key (character_appearance_keys 가 없는 레거시 샷의 폴백) */
  defaultKeyById: Map<string, string>
}

interface BlockingEntry {
  character_id?: unknown
  position_in_frame?: unknown
  pose?: unknown
}

/** 인물×모습 키 — 배치 그리드와 같은 규약(NUL 구분자: id 에 못 들어가는 문자). */
export function pairKey(characterId: string, appearanceKey: string): string {
  return `${characterId}\u0000${appearanceKey}`
}

export function readCharacterBlocking(staticSpec: unknown): Map<string, { position: string | null; pose: string | null }> {
  const out = new Map<string, { position: string | null; pose: string | null }>()
  const blocking = (staticSpec as { character_blocking?: unknown } | null)?.character_blocking
  if (!Array.isArray(blocking)) return out
  for (const raw of blocking as BlockingEntry[]) {
    const id = typeof raw?.character_id === 'string' ? raw.character_id.trim() : ''
    if (!id || out.has(id)) continue
    out.set(id, {
      position: typeof raw.position_in_frame === 'string' && raw.position_in_frame.trim() ? raw.position_in_frame.trim() : null,
      pose: typeof raw.pose === 'string' && raw.pose.trim() ? raw.pose.trim() : null,
    })
  }
  return out
}

function readAppearanceKeys(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [id, key] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key === 'string' && key.trim()) out[id] = key.trim()
  }
  return out
}

/**
 * 순수 계획 — 한 샷의 인물 참조(결정적 순서)와 빠진 시트 목록.
 *   characters 가 배열이 아니면(레거시/미정의) 빈 계획 — 호출부가 종전 동작(클라 참조)으로 간다.
 */
export function planShotCharacterRefs(
  shot: ShotRowForReferences,
  lookup: ReferenceLookup,
): { characterRefs: ShotCharacterRef[]; missing: MissingSheet[] } {
  if (!Array.isArray(shot.characters)) return { characterRefs: [], missing: [] }
  const ids = applyDirectorRefs(
    [...new Set(
      (shot.characters as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()),
    )].sort((a, b) => a.localeCompare(b)),
    parseDirectorRefs(shot.director_refs),
  )
  const keys = readAppearanceKeys(shot.character_appearance_keys)
  const blocking = readCharacterBlocking(shot.static_spec)
  const characterRefs: ShotCharacterRef[] = []
  const missing: MissingSheet[] = []
  for (const characterId of ids) {
    const character = lookup.characterById.get(characterId)
    const name = (character?.name ?? '').trim() || characterId
    const appearanceKey = keys[characterId] ?? lookup.defaultKeyById.get(characterId) ?? 'current'
    const url = lookup.sheetByPair.get(pairKey(characterId, appearanceKey))
    if (!character || typeof url !== 'string' || !url.trim()) {
      missing.push({ characterId, appearanceKey, name })
      continue
    }
    const b = blocking.get(characterId)
    characterRefs.push({
      characterId,
      appearanceKey,
      name,
      url: url.trim(),
      position: b?.position ?? null,
      pose: b?.pose ?? null,
    })
  }
  return { characterRefs, missing }
}

/**
 * DB 로더 — 여러 샷을 한 번의 조회 묶음으로 계획한다. 반환 맵은 shot_id → 계획.
 *   characters 가 배열이 아닌 샷은 맵에 넣지 않는다(호출부가 레거시 경로로 판정).
 */
export async function loadShotReferencePlans(
  projectId: string,
  shots: ShotRowForReferences[],
): Promise<Map<string, ShotReferencePlan>> {
  const planned = shots.filter((s) => Array.isArray(s.characters))
  const out = new Map<string, ShotReferencePlan>()
  if (!planned.length) return out

  const allIds = [...new Set(
    planned.flatMap((s) => (s.characters as unknown[]).filter((x): x is string => typeof x === 'string')),
  )]
  const sceneIds = [...new Set(planned.map((s) => s.scene_id).filter((x): x is string => typeof x === 'string' && x.length > 0))]

  const [{ data: chars, error: cErr }, { data: appearances, error: aErr }, worldByScene] = await Promise.all([
    allIds.length
      ? supabaseAdmin.from('characters').select('character_id, name').eq('project_id', projectId).in('character_id', allIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    allIds.length
      ? supabaseAdmin
          .from('character_appearances')
          .select('character_id, appearance_key, is_default, sheet_url')
          .eq('project_id', projectId)
          .in('character_id', allIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    loadSceneWorldRefs(projectId, sceneIds),
  ])
  if (cErr) throw cErr
  if (aErr) throw aErr

  const lookup: ReferenceLookup = {
    characterById: new Map((chars ?? []).map((c) => [c.character_id as string, { name: String(c.name ?? '') }])),
    sheetByPair: new Map(),
    defaultKeyById: new Map(),
  }
  for (const a of appearances ?? []) {
    const id = a.character_id as string
    const key = a.appearance_key as string
    lookup.sheetByPair.set(pairKey(id, key), typeof a.sheet_url === 'string' ? a.sheet_url : null)
    if (a.is_default === true && !lookup.defaultKeyById.has(id)) lookup.defaultKeyById.set(id, key)
  }
  for (const shot of planned) {
    const { characterRefs, missing } = planShotCharacterRefs(shot, lookup)
    out.set(shot.shot_id, {
      characterRefs,
      missing,
      worldRef:
        directorRefsExcludeWorld(parseDirectorRefs(shot.director_refs))
          ? null
          : (typeof shot.scene_id === 'string' && worldByScene.get(shot.scene_id)) || null,
    })
  }
  return out
}

export interface SceneRowForWorld {
  scene_id: string
  location?: string | null
  /** 약속 C10: 씬의 서사 시점 — 같은 시점의 배경 모습(변형)이 있고 이미지가 있으면 그것을 쓴다. */
  narrative_time?: string | null
}
export interface LocationRowForWorld {
  location_id?: string | null
  scene_id?: string | null
  wide_shot?: string | null
}
export interface LocationAppearanceRowForWorld {
  location_id: string
  appearance_key: string
  narrative_time?: string | null
  wide_shot?: string | null
}

/**
 * 순수(약속 C10): 씬의 narrative_time 과 같은 시점의 배경 변형 중 이미지가 있는 첫 것(만든 순서)을 고른다.
 *   없으면 null → 호출부가 기본 모습(locations.wide_shot)으로 간다. 캐릭터 resolveCharacterAppearance 와 같은 원칙.
 */
export function resolveLocationAppearanceForScene(
  narrativeTime: string | null | undefined,
  variants: readonly LocationAppearanceRowForWorld[],
): LocationAppearanceRowForWorld | null {
  if (!narrativeTime) return null
  return variants.find((v) => v.narrative_time === narrativeTime && typeof v.wide_shot === 'string' && !!v.wide_shot.trim()) ?? null
}

/** 순수: scene_id → wide_shot. scenes.location(location_id) 우선, locations.scene_id 폴백. */
export function resolveSceneWorldRefs(
  scenes: SceneRowForWorld[],
  locations: LocationRowForWorld[],
  variants: LocationAppearanceRowForWorld[] = [],
): Map<string, string> {
  const variantsByLocation = new Map<string, LocationAppearanceRowForWorld[]>()
  for (const v of variants) (variantsByLocation.get(v.location_id) ?? variantsByLocation.set(v.location_id, []).get(v.location_id)!).push(v)
  const wideByLocationId = new Map<string, string>()
  const wideBySceneId = new Map<string, string>()
  for (const l of locations) {
    const url = typeof l.wide_shot === 'string' ? l.wide_shot.trim() : ''
    if (!url) continue
    if (typeof l.location_id === 'string' && l.location_id && !wideByLocationId.has(l.location_id)) wideByLocationId.set(l.location_id, url)
    if (typeof l.scene_id === 'string' && l.scene_id && !wideBySceneId.has(l.scene_id)) wideBySceneId.set(l.scene_id, url)
  }
  const out = new Map<string, string>()
  for (const s of scenes) {
    const locationId = typeof s.location === 'string' && s.location ? s.location : null
    // 약속 C10: 씬 시점과 맞는 변형 이미지가 있으면 그것이 먼저다.
    const variant = locationId ? resolveLocationAppearanceForScene(s.narrative_time, variantsByLocation.get(locationId) ?? []) : null
    const byLocation = variant?.wide_shot ?? (locationId ? wideByLocationId.get(locationId) : undefined)
    const url = byLocation ?? wideBySceneId.get(s.scene_id)
    if (url) out.set(s.scene_id, url)
  }
  return out
}

/** DB: 씬들의 배경(wide_shot) — 배치 그리드·단건 strip 공용. */
export async function loadSceneWorldRefs(projectId: string, sceneIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(sceneIds.filter((x) => typeof x === 'string' && x.length > 0))]
  if (!ids.length) return new Map()
  const [{ data: scenes, error: sErr }, { data: locs, error: lErr }, { data: variants }] = await Promise.all([
    supabaseAdmin.from('scenes').select('scene_id, location, narrative_time').eq('project_id', projectId).in('scene_id', ids),
    supabaseAdmin.from('locations').select('location_id, scene_id, wide_shot').eq('project_id', projectId),
    // 약속 C10: 배경 모습(변형) — 표가 없는 환경(마이그레이션 전)은 빈 목록으로 폴백.
    supabaseAdmin.from('location_appearances').select('location_id, appearance_key, narrative_time, wide_shot').eq('project_id', projectId).order('created_at'),
  ])
  if (sErr) throw sErr
  if (lErr) throw lErr
  return resolveSceneWorldRefs(
    (scenes ?? []) as SceneRowForWorld[],
    (locs ?? []) as LocationRowForWorld[],
    (variants ?? []) as LocationAppearanceRowForWorld[],
  )
}

/** URL 비교용 — 캐시버스트(?v=)를 떼고 같은 객체인지 본다. */
export function stripUrlQuery(url: string): string {
  const i = url.indexOf('?')
  return i === -1 ? url : url.slice(0, i)
}
