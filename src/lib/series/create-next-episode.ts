// 앞 화에서 다음 화를 만드는 서버 작업(2026-10-26) — /api/project/next-episode 의 미리보기 · 만들기가 같이 쓴다.
//   고르는 목록이 없다: 앞 화의 사람 인물 · 배경 · 그림 · 그림체 · 말투 · 화면 비율 · 대사 언어를 전부 이어받는다.
//   그림은 우리 보관함(media 버킷) 안에서만 복사한다 — 바깥 주소는 복사하지 않고 실패로 센다(fetch 금지).
//   projects.series(SeriesSnapshot)를 쓰는 유일한 곳이다. 요금제 · 작업 공간 확인은 라우트와 prepareReferenceImport 가 한다.
import { ratioFromFormat } from '@/features/entry/options'
import { storyboardImageEndFrame, storyboardImageStartFrame } from '@/lib/director/storyboard-image'
import { emptyEntryDraft } from '@/lib/entry/draft'
import { copyOwnMediaTo, prepareReferenceImport } from '@/lib/reference-import'
import { storageKeySegment } from '@/lib/storage/key-segment'
import { parseCustomStyleAnchor } from '@/lib/style-anchor'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { AppLocale } from '@/lib/locale'
import { getActiveRun } from '@/lib/writer/run-store'
import { parseDialogueLanguage, type DialogueLanguage } from '@/lib/writer/pipeline/util/output-language'
import type { VoiceProfile } from '@/lib/writer/types/pipeline'
import { parseProjectFormat, type ProjectFormat } from '@/types/project'
import {
  SERIES_VERSION,
  parseSeries,
  styleIdOf,
  type SeriesCharacter,
  type SeriesLocation,
  type SeriesSnapshot,
} from './snapshot'

/** 다음 화 보관함 안 그림이 들어가는 칸. */
const SERIES_DIR = 'series'
/** 새 프로젝트 제목 — 지금 새 프로젝트와 같다(시작 화면에서 이름을 정한다). */
const NEXT_EPISODE_TITLE = 'Untitled'

export type NextEpisodeWarningCode =
  | 'style_anchor_copy_failed'
  | 'last_scene_copy_failed'
  | 'last_scene_unavailable'

export interface NextEpisodeWarning {
  code: NextEpisodeWarningCode
  detail: string
}

/** 앞 화로 다음 화를 만들 수 없는 경우 — 라우트가 code · status 를 그대로 응답으로 쓴다. */
export class NextEpisodeError extends Error {
  readonly status: 404 | 409
  readonly code: string

  constructor(code: string, status: 404 | 409, message = code) {
    super(message)
    this.name = 'NextEpisodeError'
    this.code = code
    this.status = status
  }
}

interface PrevCharacter {
  characterId: string
  name: string
  role: string
  appearance: string
  personality: string[]
  sheetUrl: string | null
  portraitUrl: string | null
}

interface PrevLocation {
  locationId: string
  name: string
  description: string
  wideShotUrl: string | null
}

/** 다음 화로 넘길 앞 화 재료 — 미리보기와 만들기가 같은 검사 · 같은 읽기를 쓴다. */
export interface PrevEpisode {
  id: string
  title: string
  locale: AppLocale | null
  format: ProjectFormat | null
  dialogueLanguage: DialogueLanguage | null
  styleAnchorKey: string | null
  /** 앞 화 custom_style_anchor(jsonb) 원본 — 모든 칸을 그대로 넘기려고 다듬지 않는다. */
  customStyleAnchor: Record<string, unknown> | null
  /** 앞 화도 시리즈였으면 그 기록 — 이어받은 그대로인 그림의 그림체를 가린다. */
  prevSeries: SeriesSnapshot | null
  characters: PrevCharacter[]
  locations: PrevLocation[]
  voices: VoiceProfile[]
  /** 앞 화 마지막 샷의 완성된 끝 장면. 없으면 null — 마지막 장면 잇기를 하지 않는다. */
  lastSceneUrl: string | null
}

export interface NextEpisodePreview {
  prevTitle: string
  characters: string[]
  locations: string[]
  hasVoices: boolean
  lastSceneAvailable: boolean
}

export type CreateNextEpisodeResult =
  | {
      status: 'ok'
      project: Record<string, unknown>
      warnings: NextEpisodeWarning[]
      copyFailures: string[]
    }
  | { status: 'slot_limit' }

/**
 * 앞 화 재료를 읽는다. 같은 작업 공간 · 주인 · 요금제는 prepareReferenceImport 가 확인하고(404 · 403),
 * 씬이 하나도 없는 화(Artist [만들기] 전)는 409 series_not_ready 다.
 */
export async function loadPrevEpisode(input: {
  userId: string
  workspaceId: string
  fromProjectId: string
  destinationProjectId?: string
}): Promise<PrevEpisode> {
  await prepareReferenceImport({
    userId: input.userId,
    destinationWorkspaceId: input.workspaceId,
    referenceProjectId: input.fromProjectId,
    destinationProjectId: input.destinationProjectId,
  })
  const prevProjectId = input.fromProjectId.trim()

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, title, locale, settings, style_anchor_key, custom_style_anchor, series')
    .eq('id', prevProjectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project) throw new NextEpisodeError('reference_not_found', 404)

  const { data: scenes, error: sceneError } = await supabaseAdmin
    .from('scenes')
    .select('id, sort_order')
    .eq('project_id', prevProjectId)
  if (sceneError) throw sceneError
  if (!scenes || scenes.length === 0) throw new NextEpisodeError('series_not_ready', 409)

  const [characters, appearances, locations, run, lastSceneUrl] = await Promise.all([
    selectRows(prevProjectId, 'characters', 'character_id, name, role, entity_type, appearance, appearance_native'),
    selectRows(
      prevProjectId,
      'character_appearances',
      'character_id, is_default, appearance, appearance_native, sheet_url, portrait_url',
    ),
    selectRows(
      prevProjectId,
      'locations',
      'location_id, name, visual_description, visual_description_native, wide_shot',
    ),
    getActiveRun(prevProjectId),
    findLastSceneFrame(prevProjectId, scenes as SceneRow[]),
  ])

  const settings = asObject(project.settings)
  const personalityOf = personalityIndex(run?.state)

  return {
    id: project.id as string,
    title: text(project.title) || NEXT_EPISODE_TITLE,
    locale: project.locale === 'ko' || project.locale === 'en' ? project.locale : null,
    format: parseProjectFormat(settings?.format),
    dialogueLanguage: parseDialogueLanguage(settings?.dialogueLanguage) ?? null,
    styleAnchorKey: text(project.style_anchor_key) || null,
    customStyleAnchor: asObject(project.custom_style_anchor),
    prevSeries: parseSeries(project.series),
    characters: prevCharacters(characters, appearances, personalityOf),
    locations: prevLocations(locations),
    voices: inheritedVoices(run?.state),
    lastSceneUrl,
  }
}

/** 만들기 창이 보여 주는 것 — 이어받을 이름과 마지막 장면을 이을 수 있는지. 아무것도 쓰지 않는다. */
export function prevEpisodePreview(prev: PrevEpisode): NextEpisodePreview {
  return {
    prevTitle: prev.title,
    characters: prev.characters.map((c) => c.name),
    locations: prev.locations.map((l) => l.name),
    hasVoices: prev.voices.length > 0,
    lastSceneAvailable: prev.lastSceneUrl !== null,
  }
}

/**
 * 다음 화 프로젝트를 만든다 — create_project_slotted(칸 확인 + 삽입) → 보관함 그림 복사 →
 * projects update 한 번(series · 시작 화면 단계 · 시작 화면 초안 · 그림체 · 마지막 장면 · 설정).
 * 그림 복사 실패는 되돌리지 않는다 — 카드는 넘어오고 못 가져온 이름을 알린다.
 */
export async function createNextEpisode(input: {
  prev: PrevEpisode
  workspaceId: string
  destinationProjectId: string
  /** null = 무제한(관리자). 요금제→한도 매핑은 라우트가 계산해 넘긴다(plan-limits.ts 가 진실원). */
  slotLimit: number | null
  locale: AppLocale
  continueLastScene: boolean
}): Promise<CreateNextEpisodeResult> {
  const { prev, workspaceId, destinationProjectId } = input

  const { data: creationData, error } = await supabaseAdmin.rpc('create_project_slotted', {
    p_project_id: destinationProjectId,
    p_workspace_id: workspaceId,
    p_title: NEXT_EPISODE_TITLE,
    p_locale: input.locale,
    p_locale_locked: true,
    p_reference_project_id: prev.id,
    p_slot_limit: input.slotLimit,
  })
  const creation = creationData as { status?: string; project?: Record<string, unknown> } | null
  if (error || !creation || typeof creation !== 'object') {
    throw new Error(error?.message ?? 'Failed to create the next episode')
  }
  if (creation.status === 'slot_limit') return { status: 'slot_limit' }
  const project = creation.status === 'ok' ? creation.project : null
  if (!project) {
    throw new Error(`Failed to create the next episode (${String(creation.status)})`)
  }

  const warnings: NextEpisodeWarning[] = []
  const copyFailures: string[] = []
  const prevStyleId = styleIdOf({
    style_anchor_key: prev.styleAnchorKey,
    custom_style_anchor: prev.customStyleAnchor,
  })
  const pathOf = (kind: string, sourceId: string) =>
    `${workspaceId}/${destinationProjectId}/${SERIES_DIR}/${kind}-${storageKeySegment(sourceId)}`

  const characters: SeriesCharacter[] = []
  for (const c of prev.characters) {
    const sheet = await copyImage(c.sheetUrl, pathOf('sheet', c.characterId))
    const portrait = await copyImage(c.portraitUrl, pathOf('portrait', c.characterId))
    if (sheet.failed || portrait.failed) copyFailures.push(c.name)
    const inherited = prev.prevSeries?.characters.find((x) => x.characterId === c.characterId)
    characters.push({
      characterId: c.characterId,
      name: c.name,
      role: c.role,
      appearance: c.appearance,
      personality: c.personality,
      sheetUrl: sheet.url,
      portraitUrl: portrait.url,
      styleId: carriedStyleId(inherited?.sheetUrl ?? null, inherited?.styleId ?? null, c.sheetUrl, prevStyleId),
    })
  }

  const locations: SeriesLocation[] = []
  for (const l of prev.locations) {
    const wide = await copyImage(l.wideShotUrl, pathOf('wide', l.locationId))
    if (wide.failed) copyFailures.push(l.name)
    const inherited = prev.prevSeries?.locations.find((x) => x.locationId === l.locationId)
    locations.push({
      locationId: l.locationId,
      name: l.name,
      description: l.description,
      wideShotUrl: wide.url,
      styleId: carriedStyleId(inherited?.wideShotUrl ?? null, inherited?.styleId ?? null, l.wideShotUrl, prevStyleId),
    })
  }

  const updates: Record<string, unknown> = {
    current_stage: 'entry',
    entry_draft: entryDraftWithRatio(prev.format),
    style_anchor_key: prev.styleAnchorKey,
  }

  // 사용자가 올린 그림체: 분석 결과 · 잠금 등 모든 칸을 그대로 두고 그림만 이 프로젝트 보관함으로 옮긴다.
  //   analysis_pending_at 은 앞 화에서 돌던 분석 표시라 다음 화로 옮기면 Artist 그림이 영영 미뤄진다.
  const custom = parseCustomStyleAnchor(prev.customStyleAnchor)
  if (custom && prev.customStyleAnchor) {
    const copied = await copyOwnMediaTo(custom.url, pathOf('style-anchor', prev.id))
    if (copied.ok) {
      const next: Record<string, unknown> = { ...prev.customStyleAnchor, url: copied.url }
      delete next.analysis_pending_at
      updates.custom_style_anchor = next
    } else {
      warnings.push({ code: 'style_anchor_copy_failed', detail: copied.detail })
      console.error('[project/next-episode] anchor copy failed', copied.detail)
    }
  }

  let continuesLastScene = false
  if (input.continueLastScene) {
    if (!prev.lastSceneUrl) {
      warnings.push({
        code: 'last_scene_unavailable',
        detail: 'the previous episode has no completed storyboard image on its last shot',
      })
    } else {
      const copied = await copyOwnMediaTo(prev.lastSceneUrl, pathOf('last-scene', prev.id))
      if (copied.ok) {
        updates.optional_reference_frame_url = copied.url
        continuesLastScene = true
      } else {
        warnings.push({ code: 'last_scene_copy_failed', detail: copied.detail })
        console.error('[project/next-episode] last scene copy failed', copied.detail)
      }
    }
  }

  // 나머지 설정(장르 · 길이 · 바꿈 정도)은 시작 화면이 채운다 — 앞 화에서 가져오는 것은 이 둘뿐이다.
  const settings: Record<string, unknown> = {}
  if (prev.format) settings.format = prev.format
  if (prev.dialogueLanguage) settings.dialogueLanguage = prev.dialogueLanguage
  if (Object.keys(settings).length > 0) updates.settings = settings

  const series: SeriesSnapshot = {
    version: SERIES_VERSION,
    prevProjectId: prev.id,
    prevTitle: prev.title,
    copiedAt: new Date().toISOString(),
    characters,
    locations,
    voices: prev.voices,
    styleId: prevStyleId,
    format: prev.format,
    dialogueLanguage: prev.dialogueLanguage,
    continuesLastScene,
    copyFailures,
  }
  updates.series = series

  const { error: updateError } = await supabaseAdmin
    .from('projects')
    .update(updates)
    .eq('id', destinationProjectId)
    .eq('workspace_id', workspaceId)
  if (updateError) {
    throw new Error(`Failed to save the next episode (${errorMessage(updateError)})`)
  }

  return { status: 'ok', project: { ...project, ...updates }, warnings, copyFailures }
}

interface SceneRow {
  id: string
  sort_order: number | null
}

interface ShotRow {
  scene_id: string
  sort_order: number | null
  storyboard_image: unknown
}

async function selectRows(
  projectId: string,
  table: 'characters' | 'character_appearances' | 'locations',
  columns: string,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabaseAdmin.from(table).select(columns).eq('project_id', projectId)
  if (error) throw error
  return (data ?? []) as unknown as Array<Record<string, unknown>>
}

/**
 * 씬 순서 → 샷 순서의 마지막 샷에서 완성된 스토리보드 그림의 끝 장면.
 *   러프 · 썸네일로 대체하지 않는다 — 다음 화 첫 샷이 완성되지 않은 그림에서 이어지면 안 된다.
 */
async function findLastSceneFrame(projectId: string, scenes: SceneRow[]): Promise<string | null> {
  const { data: shots, error } = await supabaseAdmin
    .from('shots')
    .select('scene_id, sort_order, storyboard_image')
    .eq('project_id', projectId)
  if (error) throw error

  const sceneRank = new Map(scenes.map((scene) => [scene.id, scene.sort_order ?? -Infinity]))
  const lastShot = [...((shots ?? []) as unknown as ShotRow[])].sort((a, b) => {
    const sceneDelta = (sceneRank.get(b.scene_id) ?? -Infinity) - (sceneRank.get(a.scene_id) ?? -Infinity)
    if (sceneDelta !== 0) return sceneDelta
    return (b.sort_order ?? -Infinity) - (a.sort_order ?? -Infinity)
  })[0]
  if (!lastShot) return null

  const image = lastShot.storyboard_image
  const end = storyboardImageEndFrame(image)
  if (end) return end
  // 3프레임 세트인데 끝 칸이 비었으면 시작 그림으로 대신하지 않는다. 옛 단일 그림은 대표 url 이 끝 장면이다.
  if (asObject(image)?.frames) return null
  return storyboardImageStartFrame(image)
}

function prevCharacters(
  characters: Array<Record<string, unknown>>,
  appearances: Array<Record<string, unknown>>,
  personalityOf: Map<string, string[]>,
): PrevCharacter[] {
  const defaults = new Map<string, Record<string, unknown>>()
  for (const row of appearances) {
    const id = text(row.character_id)
    if (!id || row.is_default !== true) continue
    defaults.set(id, row)
  }
  const out: PrevCharacter[] = []
  for (const row of characters) {
    // 사물 카드는 그 화 사건에 묶인 소품이라 넘기지 않는다(사람만 이어받는다).
    if (row.entity_type === 'object') continue
    const characterId = text(row.character_id)
    const name = text(row.name)
    if (!characterId || !name) continue
    const appearance = defaults.get(characterId)
    out.push({
      characterId,
      name,
      role: text(row.role) || 'supporting',
      appearance:
        text(appearance?.appearance_native) ||
        text(appearance?.appearance) ||
        text(row.appearance_native) ||
        text(row.appearance),
      personality: personalityOf.get(characterId) ?? [],
      sheetUrl: text(appearance?.sheet_url) || null,
      portraitUrl: text(appearance?.portrait_url) || null,
    })
  }
  return out
}

function prevLocations(locations: Array<Record<string, unknown>>): PrevLocation[] {
  const out: PrevLocation[] = []
  for (const row of locations) {
    const locationId = text(row.location_id)
    const name = text(row.name)
    if (!locationId || !name) continue
    out.push({
      locationId,
      name,
      description: text(row.visual_description_native) || text(row.visual_description),
      wideShotUrl: text(row.wide_shot) || null,
    })
  }
  return out
}

/** 앞 화 최신 실행이 정한 성격 — 인물 번호(character_id = state 의 id)로 맞춘다. */
function personalityIndex(state: unknown): Map<string, string[]> {
  const rows = asObject(asObject(state)?.characters)?.characters
  const out = new Map<string, string[]>()
  if (!Array.isArray(rows)) return out
  for (const row of rows) {
    const id = text(asObject(row)?.id)
    const personality = asObject(row)?.personality
    if (!id || !Array.isArray(personality)) continue
    const values = personality.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    if (values.length > 0) out.set(id, values)
  }
  return out
}

/** 말투는 앞 화가 대사까지 끝났을 때만 있다(state.dialogue.profiles). 없으면 빈 목록. */
function inheritedVoices(state: unknown): VoiceProfile[] {
  const profiles = asObject(asObject(state)?.dialogue)?.profiles
  if (!Array.isArray(profiles)) return []
  return profiles.filter((p): p is VoiceProfile => !!text(asObject(p)?.character_id))
}

/**
 * 이 그림을 그린 그림체. 앞 화도 시리즈였고 지금 그림 주소가 앞 화가 이어받은 주소와 같으면
 * (앞 화에서 다시 그리지 않고 그대로 쓴 그림이면) 그 그림을 처음 그린 화의 그림체를 이어 쓴다.
 */
function carriedStyleId(
  inheritedImage: string | null,
  inheritedStyleId: string | null,
  currentImage: string | null,
  prevStyleId: string | null,
): string | null {
  if (currentImage && inheritedImage && inheritedImage === currentImage) return inheritedStyleId
  return prevStyleId
}

/** 시작 화면 초안 — 앞 화 화면 비율만 기본값으로 넣고 나머지는 사람이 고른다. */
function entryDraftWithRatio(format: ProjectFormat | null) {
  const draft = emptyEntryDraft()
  return { ...draft, picks: { ...draft.picks, ratio: ratioFromFormat(format) } }
}

async function copyImage(
  url: string | null,
  destinationPathWithoutExtension: string,
): Promise<{ url: string | null; failed: boolean }> {
  if (!url) return { url: null, failed: false }
  const copied = await copyOwnMediaTo(url, destinationPathWithoutExtension)
  if (copied.ok) return { url: copied.url, failed: false }
  console.error('[project/next-episode] image copy failed', copied.detail)
  return { url: null, failed: true }
}

const asObject = (v: unknown): Record<string, unknown> | null =>
  !!v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const message = asObject(error)?.message
  return typeof message === 'string' ? message : String(error)
}
