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
import { designCharacterIds, extraCharactersInShot, promptName, subjectAnchor } from '@/lib/director/still-prompt'
import type { PropForRefs } from '@/lib/director/shot-prop-refs'

export { applyDirectorRefs, directorRefsExcludeWorld, parseDirectorRefs, type DirectorRefs } from '@/lib/director/director-refs'

export const MISSING_CHARACTER_SHEETS = 'missing_character_sheets' as const

export interface ShotCharacterRef {
  characterId: string
  appearanceKey: string
  /** 표시명(characters.name) — 프롬프트의 "reference image N = 이름" */
  name: string
  /** 실사 그림체 지시문에 쓸 이름 — 저장된 영어 이름이 있으면 그것(실사 그림체로 부를 때만 채운다, 2026-11-23). */
  promptName?: string
  /** 짧은 겉모습(영어 첫 마디) — 실사 그림체로 부를 때만 채운다. 없으면 null. */
  look?: string | null
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
  /** 실사 그림체에서 인물 목록에 빠졌지만 이 샷에 나오는 인물을 찾을 때만 본다(2026-11-23, still-prompt extraCharactersInShot). */
  dynamic_spec?: unknown
  prompt?: unknown
  action_description?: unknown
  action_description_native?: unknown
}

/** 실사 그림체(2026-11-23 오너 "2 모두 적용")의 참조 계획 — 빠진 인물을 더하고 지시문 이름 · 겉모습을 함께 준다. 없으면 지금 그대로. */
export interface ReferencePlanOptions {
  photo?: boolean
}


export interface ReferenceLookup {
  /** characters.character_id → { name, promptName? } */
  characterById: Map<string, { name: string; promptName?: string }>
  /** `${characterId}\u0000${appearanceKey}` → 모습 설명(영어) — 실사 그림체만. */
  lookByPair?: Map<string, string>
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
/** 프레임 밖 봉인(2026-09-05): 무대가 이 카메라 밖으로 판정한 인물 id(static_spec.screen_layout.off_frame). */
export function readOffFrame(staticSpec: unknown): string[] {
  if (!staticSpec || typeof staticSpec !== 'object') return []
  const lay = (staticSpec as { screen_layout?: { off_frame?: unknown } }).screen_layout
  const raw = lay?.off_frame
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
}

export function planShotCharacterRefs(
  shot: ShotRowForReferences,
  lookup: ReferenceLookup,
  opts?: ReferencePlanOptions,
): { characterRefs: ShotCharacterRef[]; missing: MissingSheet[] } {
  if (!Array.isArray(shot.characters)) return { characterRefs: [], missing: [] }
  const offFrame = new Set(readOffFrame(shot.static_spec))
  const listed = applyDirectorRefs(
    [...new Set(
      (shot.characters as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()),
    )].sort((a, b) => a.localeCompare(b)),
    parseDirectorRefs(shot.director_refs),
  ).filter((id) => !offFrame.has(id)) // 프레임 밖 인물의 시트는 붙이지 않는다 — 남은 참조로 인물을 지어내는 원천
  // 목록에서 빠졌지만 이 샷에 나오는 인물(설계와 글에 있는 인물 · 비친 모습 샷) — 시트 없이 그리면 얼굴을 지어낸다. 실사 그림체만.
  const ids = opts?.photo
    ? [...new Set([
        ...listed,
        ...extraCharactersInShot(
          shot,
          new Map([...lookup.characterById].map(([id, c]) => [id, [c.name, c.promptName ?? '', id.replace(/_/g, ' ')].filter(Boolean)])),
        ),
      ])].sort((a, b) => a.localeCompare(b))
    : listed
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
      ...(opts?.photo
        ? {
            promptName: (character.promptName ?? '').trim() || name,
            look: subjectAnchor(lookup.lookByPair?.get(pairKey(characterId, appearanceKey)), 80),
          }
        : {}),
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
  opts?: ReferencePlanOptions,
): Promise<Map<string, ShotReferencePlan>> {
  const planned = shots.filter((s) => Array.isArray(s.characters))
  const out = new Map<string, ShotReferencePlan>()
  if (!planned.length) return out

  const allIds = [...new Set(
    planned.flatMap((s) => [...(s.characters as unknown[]).filter((x): x is string => typeof x === 'string'), ...(opts?.photo ? designCharacterIds(s) : [])]),
  )]
  const sceneIds = [...new Set(planned.map((s) => s.scene_id).filter((x): x is string => typeof x === 'string' && x.length > 0))]

  const [{ data: chars, error: cErr }, { data: appearances, error: aErr }, worldByScene] = await Promise.all([
    allIds.length
      ? supabaseAdmin.from('characters').select(opts?.photo ? 'character_id, name, name_en, name_en_source' : 'character_id, name').eq('project_id', projectId).in('character_id', allIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    allIds.length
      ? supabaseAdmin
          .from('character_appearances')
          .select(opts?.photo ? 'character_id, appearance_key, is_default, sheet_url, appearance' : 'character_id, appearance_key, is_default, sheet_url')
          .eq('project_id', projectId)
          .in('character_id', allIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    loadSceneWorldRefs(projectId, sceneIds),
  ])
  if (cErr) throw cErr
  if (aErr) throw aErr

  const characterRows = (chars ?? []) as unknown as Array<Record<string, unknown>>
  const appearanceRows = (appearances ?? []) as unknown as Array<Record<string, unknown>>
  const lookup: ReferenceLookup = {
    characterById: new Map(characterRows.map((c) => [c.character_id as string, { name: String(c.name ?? ''), ...(opts?.photo ? { promptName: promptName(c) } : {}) }])),
    sheetByPair: new Map(),
    defaultKeyById: new Map(),
    ...(opts?.photo ? { lookByPair: new Map<string, string>() } : {}),
  }
  for (const a of appearanceRows) {
    const id = a.character_id as string
    const key = a.appearance_key as string
    lookup.sheetByPair.set(pairKey(id, key), typeof a.sheet_url === 'string' ? a.sheet_url : null)
    if (a.is_default === true && !lookup.defaultKeyById.has(id)) lookup.defaultKeyById.set(id, key)
    if (lookup.lookByPair && typeof a.appearance === 'string' && a.appearance.trim()) lookup.lookByPair.set(pairKey(id, key), a.appearance)
  }
  for (const shot of planned) {
    const { characterRefs, missing } = planShotCharacterRefs(shot, lookup, opts)
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

/**
 * 실사 소품 참고(D7 2단계, 2026-11-22) — 그림이 있는 소품(props 행). 같은 id 의 인물 행이 있는 소품은 뺀다(예전 저장 고장 —
 *   인물 시트로 이미 붙는다). 호출부는 실패하면 소품 없이 그린다(지금과 같다).
 */
export async function loadPropsForReferences(projectId: string): Promise<PropForRefs[]> {
  const [props, people, appearances] = await Promise.all([
    supabaseAdmin.from('props').select('prop_id, name, image_url').eq('project_id', projectId),
    supabaseAdmin.from('characters').select('character_id').eq('project_id', projectId),
    // 소품 모습(m1126 A3) — 표가 아직 없는 환경(마이그레이션 전)이면 모습 없이(기본 그림만) 간다.
    supabaseAdmin.from('prop_appearances').select('prop_id, appearance_key, narrative_time, image_url').eq('project_id', projectId).order('created_at'),
  ])
  if (props.error) throw props.error
  if (people.error) throw people.error
  const personIds = new Set(((people.data ?? []) as Array<{ character_id: string }>).map((row) => row.character_id))
  const byProp = new Map<string, NonNullable<PropForRefs['appearances']>>()
  for (const row of (appearances.error ? [] : (appearances.data ?? [])) as Array<{ prop_id: string; appearance_key: string; narrative_time: string | null; image_url: string | null }>) {
    const list = byProp.get(row.prop_id) ?? []
    list.push({ appearanceKey: row.appearance_key, narrativeTime: row.narrative_time, imageUrl: row.image_url })
    byProp.set(row.prop_id, list)
  }
  const hasImage = (url: string | null | undefined) => typeof url === 'string' && !!url.trim()
  return ((props.data ?? []) as Array<{ prop_id: string; name: string; image_url: string | null }>)
    .filter((row) => !personIds.has(row.prop_id) && (hasImage(row.image_url) || (byProp.get(row.prop_id) ?? []).some((a) => hasImage(a.imageUrl))))
    .map((row) => ({ propId: row.prop_id, name: row.name, imageUrl: hasImage(row.image_url) ? row.image_url : null, ...(byProp.has(row.prop_id) ? { appearances: byProp.get(row.prop_id) } : {}) }))
}

/** URL 비교용 — 캐시버스트(?v=)를 떼고 같은 객체인지 본다. */
export function stripUrlQuery(url: string): string {
  const i = url.indexOf('?')
  return i === -1 ? url : url.slice(0, i)
}
