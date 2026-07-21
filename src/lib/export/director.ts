import { createClient } from '@/lib/supabase/client'
import { selectHandoffTake } from '@/lib/director-video-take-selection'

import { bulletList, escapeMd, h1, h2, isRecord, kvSection, labelPart, nativeText, pickNative, table, textOrUnset } from './md'
import { PathAllocator } from './sanitize'
import type { ArtifactFile } from './types'

export interface DirectorExportData {
  scenes: SceneRow[]
  shots: ShotRow[]
  videoClips: ClipRow[]
}

export interface SceneRow extends Record<string, unknown> {
  id?: string | null
  project_id?: string | null
  scene_id: string
  narrative_summary?: string | null
  narrative_summary_native?: string | null
  location?: string | null
  time_of_day?: string | null
  mood?: string | null
  mood_native?: string | null
  sort_order?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export interface ShotRow extends Record<string, unknown> {
  id?: string | null
  project_id?: string | null
  scene_id: string
  shot_id: string
  shot_type?: string | null
  action_description?: string | null
  action_description_native?: string | null
  dialogue_lines?: unknown
  camera_config?: unknown
  lighting_config?: unknown
  movement_preset?: string | null
  sort_order?: number | null
  created_at?: string | null
  updated_at?: string | null
  video_url?: string | null
  storyboard_image?: unknown
}

export interface ClipRow extends Record<string, unknown> {
  id: string
  project_id?: string | null
  shot_id: string
  url?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  is_final?: boolean | null
  take_number?: number | null
  deleted_at?: string | null
  take_label?: string | null
}

export interface StoryboardImageValue extends Record<string, unknown> {
  url?: unknown
  status?: unknown
  errorMessage?: unknown
  generatedAt?: unknown
}

const IMAGE_OMITTED_SUFFIX = '— 미포함'
const CLIP_OMITTED_NOTE = '생성 중/최종 없음 — 미포함'

export const DIRECTOR_SCENES_SELECT =
  'id,project_id,scene_id,narrative_summary,narrative_summary_native,location,time_of_day,mood,mood_native,sort_order,created_at,updated_at'
export const DIRECTOR_SHOTS_SELECT =
  'id,project_id,scene_id,shot_id,shot_type,action_description,action_description_native,dialogue_lines,camera_config,lighting_config,movement_preset,sort_order,created_at,updated_at,video_url,storyboard_image'
export const DIRECTOR_VIDEO_CLIPS_SELECT =
  'id,project_id,shot_id,url,status,created_at,updated_at,is_final,take_number,deleted_at,take_label'

export function collectDirectorArtifacts(data: DirectorExportData): ArtifactFile[] {
  const allocator = new PathAllocator()
  const scenes = sortedScenes(recordRows<SceneRow>(data.scenes))
  const shots = sortedShots(recordRows<ShotRow>(data.shots))
  const clipsByShotId = groupClips(recordRows<ClipRow>(data.videoClips))
  const mediaFiles: ArtifactFile[] = []
  const shotRows = new Map<ShotRow, string[]>()

  for (const shot of shots) {
    const baseName = mediaBaseName(shot)
    const storyboard = storyboardImageValue(shot.storyboard_image)
    const storyboardUrl = completedStoryboardUrl(storyboard)
    const imagePath = storyboardUrl ? allocator.file('director/shots', baseName, 'png') : null

    if (imagePath && storyboardUrl) {
      mediaFiles.push({ path: imagePath, kind: 'media', url: storyboardUrl })
    }

    const clips = clipsByShotId.get(requiredShotId(shot)) ?? []
    const clip = selectHandoffTake(clips)
    const clipUrl = clip ? mediaUrl(clip.url) : undefined
    // shots.video_url is a legacy boundary for shots with no relational clip rows.
    const clipSourceUrl = clipUrl ?? (clips.length === 0 ? mediaUrl(shot.video_url) : undefined)
    const clipPath = clipSourceUrl ? allocator.file('director/clips', baseName, 'mp4') : null

    if (clipPath && clipSourceUrl) {
      mediaFiles.push({ path: clipPath, kind: 'media', url: clipSourceUrl })
    }

    shotRows.set(shot, [
      shotLabel(shot),
      imagePath ?? storyboardStatusNote(storyboard),
      clipPath ? clipCell(clipPath, clip) : CLIP_OMITTED_NOTE,
      textOrUnset(nativeText(shot, 'action_description')),
      textOrUnset(dialogueText(shot.dialogue_lines)),
      textOrUnset(configText(shot.camera_config)),
      textOrUnset(configText(shot.lighting_config)),
      textOrUnset(textValue(shot.movement_preset)),
    ])
  }

  return [
    {
      path: 'director/shotlist.md',
      kind: 'text',
      content: renderShotlist(scenes, shots, shotRows),
    },
    ...mediaFiles,
  ]
}

export async function loadDirectorData(projectId: string): Promise<DirectorExportData> {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new Error('projectId is required')

  const supabase = createClient()
  const [scenesRes, shotsRes, clipsRes] = await Promise.all([
    supabase
      .from('scenes')
      .select(DIRECTOR_SCENES_SELECT)
      .eq('project_id', normalizedProjectId),
    supabase
      .from('shots')
      .select(DIRECTOR_SHOTS_SELECT)
      .eq('project_id', normalizedProjectId),
    supabase
      .from('video_clips')
      .select(DIRECTOR_VIDEO_CLIPS_SELECT)
      .eq('project_id', normalizedProjectId),
  ])

  if (scenesRes.error) throw new Error(`director scenes load failed: ${scenesRes.error.message}`)
  if (shotsRes.error) throw new Error(`director shots load failed: ${shotsRes.error.message}`)
  if (clipsRes.error) throw new Error(`director video clips load failed: ${clipsRes.error.message}`)

  return {
    scenes: ((scenesRes.data ?? []) as unknown[]).filter(isRecord) as SceneRow[],
    shots: ((shotsRes.data ?? []) as unknown[]).filter(isRecord) as ShotRow[],
    videoClips: ((clipsRes.data ?? []) as unknown[]).filter(isRecord) as ClipRow[],
  }
}

function recordRows<T extends Record<string, unknown>>(rows: unknown): T[] {
  return Array.isArray(rows) ? (rows.filter(isRecord) as T[]) : []
}

function renderShotlist(
  scenes: SceneRow[],
  shots: ShotRow[],
  shotRows: Map<ShotRow, string[]>,
): string {
  let body = h1('Director Shotlist')
  body += kvSection('요약', [
    ['씬 수', String(scenes.length)],
    ['샷 수', String(shots.length)],
  ])

  if (shots.length === 0) return `${body}${escapeMd('샷 없음')}\n`

  for (const group of sceneGroups(scenes, shots)) {
    body += h2(sceneHeading(group.sceneId, group.scene))

    const details = sceneDetailItems(group.scene)
    if (details.length > 0) body += bulletList(details)

    if (group.shots.length === 0) {
      body += `${escapeMd('샷 없음')}\n\n`
      continue
    }

    body += table(
      ['Shot', 'Storyboard Image', 'Clip', 'Action', 'Dialogue', 'Camera', 'Lighting', 'Movement'],
      group.shots.map((shot) => shotRows.get(shot) ?? []),
    )
  }

  return body
}

function sortedScenes(scenes: SceneRow[]): SceneRow[] {
  return [...scenes].sort((a, b) => compareRows(a, b, sceneId))
}

function sortedShots(shots: ShotRow[]): ShotRow[] {
  return [...shots].sort((a, b) => compareRows(a, b, shotSortId))
}

function sceneGroups(
  scenes: SceneRow[],
  shots: ShotRow[],
): Array<{ sceneId: string; scene: SceneRow | null; shots: ShotRow[] }> {
  const shotsByScene = new Map<string, ShotRow[]>()
  for (const shot of shots) {
    const id = requiredSceneId(shot)
    const group = shotsByScene.get(id) ?? []
    group.push(shot)
    shotsByScene.set(id, group)
  }

  const groups: Array<{ sceneId: string; scene: SceneRow | null; shots: ShotRow[] }> = []
  const seenSceneIds = new Set<string>()

  for (const scene of scenes) {
    const id = sceneId(scene)
    seenSceneIds.add(id)
    groups.push({ sceneId: id, scene, shots: shotsByScene.get(id) ?? [] })
  }

  for (const [id, groupShots] of [...shotsByScene.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!seenSceneIds.has(id)) groups.push({ sceneId: id, scene: null, shots: groupShots })
  }

  return groups
}

function sceneDetailItems(scene: SceneRow | null): string[] {
  if (!scene) return []

  return [
    labelPart('장소', scene.location),
    labelPart('시간', scene.time_of_day),
    labelPart('무드', pickNative(textValue(scene.mood_native), textValue(scene.mood))),
    labelPart(
      '요약',
      pickNative(textValue(scene.narrative_summary_native), textValue(scene.narrative_summary)),
    ),
  ].filter((item): item is string => Boolean(item))
}


function sceneHeading(id: string, scene: SceneRow | null): string {
  const place = textValue(scene?.location)
  return place ? `Scene ${id} — ${place}` : `Scene ${id}`
}

function groupClips(clips: ClipRow[]): Map<string, ClipRow[]> {
  const byShotId = new Map<string, ClipRow[]>()
  for (const clip of clips) {
    const id = textValue(clip.shot_id)
    if (!id) continue
    const group = byShotId.get(id) ?? []
    group.push(clip)
    byShotId.set(id, group)
  }
  return byShotId
}

function clipCell(path: string, clip: ClipRow | null): string {
  const takeLabel = textValue(clip?.take_label)

  return takeLabel ? `${path} (${takeLabel})` : path
}


function completedStoryboardUrl(storyboard: StoryboardImageValue | null): string | undefined {
  if (textValue(storyboard?.status) !== 'completed') return undefined
  return mediaUrl(storyboard?.url)
}

function storyboardStatusNote(storyboard: StoryboardImageValue | null): string {
  if (!storyboard) return `이미지 없음 ${IMAGE_OMITTED_SUFFIX}`

  const status = textValue(storyboard.status)?.toLowerCase() ?? 'unknown'
  const error = textValue(storyboard.errorMessage)

  if (status === 'generating') return `생성 중 (generating) ${IMAGE_OMITTED_SUFFIX}`
  if (status === 'failed') {
    return error
      ? `실패 (failed): ${error} ${IMAGE_OMITTED_SUFFIX}`
      : `실패 (failed) ${IMAGE_OMITTED_SUFFIX}`
  }
  if (status === 'completed') return `완료 (completed), URL 없음 ${IMAGE_OMITTED_SUFFIX}`

  return `${status} ${IMAGE_OMITTED_SUFFIX}`
}

function storyboardImageValue(value: unknown): StoryboardImageValue | null {
  return isRecord(value) ? (value as StoryboardImageValue) : null
}

function mediaBaseName(shot: ShotRow): string {
  return `${requiredSceneId(shot)}-${requiredShotId(shot)}`
}

function shotLabel(shot: ShotRow): string {
  return requiredShotId(shot)
}

function sceneId(scene: SceneRow): string {
  return textValue(scene.scene_id) ?? textValue(scene.id) ?? 'unknown-scene'
}

function requiredSceneId(shot: ShotRow): string {
  return textValue(shot.scene_id) ?? 'unknown-scene'
}

function requiredShotId(shot: ShotRow): string {
  return textValue(shot.shot_id) ?? textValue(shot.id) ?? 'unknown-shot'
}

function shotSortId(shot: ShotRow): string {
  return `${requiredSceneId(shot)}-${requiredShotId(shot)}`
}

function compareRows<T extends { sort_order?: number | null }>(
  a: T,
  b: T,
  idFor: (row: T) => string,
): number {
  const aOrder =
    typeof a.sort_order === 'number' && Number.isFinite(a.sort_order)
      ? a.sort_order
      : Number.POSITIVE_INFINITY
  const bOrder =
    typeof b.sort_order === 'number' && Number.isFinite(b.sort_order)
      ? b.sort_order
      : Number.POSITIVE_INFINITY
  if (aOrder !== bOrder) return aOrder - bOrder
  return idFor(a).localeCompare(idFor(b))
}

function dialogueText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''

  return value
    .map((line) => {
      if (typeof line === 'string') return line.trim()
      if (!isRecord(line)) return ''
      const speaker = textValue(line.characterId) ?? textValue(line.character_id) ?? textValue(line.speaker)
      const text =
        nativeText(line, 'text') || nativeText(line, 'line') || nativeText(line, 'dialogue')
      return joinParts([speaker, text], ': ')
    })
    .filter(Boolean)
    .join('; ')
}

function configText(value: unknown): string {
  return humanValue(value)
}

function humanValue(value: unknown): string {
  const scalar = textValue(value)
  if (scalar) return readableScalar(scalar)

  if (Array.isArray(value)) return value.map(humanValue).filter(Boolean).join(', ')

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, child]) => {
        const rendered = humanValue(child)
        return rendered ? `${humanKey(key)}=${rendered}` : ''
      })
      .filter(Boolean)
      .join(', ')
  }

  return ''
}

function readableScalar(value: string): string {
  const parsed = parseJsonText(value)
  if (parsed === undefined) return value

  return humanValue(parsed) || value.replace(/[{}]/g, '')
}

function parseJsonText(value: string): unknown | undefined {
  const text = value.trim()
  const isJsonBody =
    (text.startsWith('{') && text.endsWith('}')) ||
    (text.startsWith('[') && text.endsWith(']'))
  if (!isJsonBody) return undefined

  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function humanKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).trim()
}

function mediaUrl(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}


function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return undefined
}


function joinParts(parts: Array<string | undefined | null>, separator = ' / '): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(separator)
}
