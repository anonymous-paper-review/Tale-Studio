import { canUseReference } from '@/lib/plan-limits'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { parseCustomStyleAnchor } from '@/lib/style-anchor'
import {
  isOwnMediaUrl,
  mediaPathFromUrl,
} from '@/lib/storage/media-url'
import {
  mediaCopy,
  mediaPublicUrl,
} from '@/lib/storage/media'
import { storageKeySegment } from '@/lib/storage/key-segment'

export type ReferenceImportWarningCode =
  | 'style_anchor_copy_failed'
  | 'reference_frame_copy_failed'

export interface ReferenceImportWarning {
  code: ReferenceImportWarningCode
  detail: string
}

export class ReferenceImportValidationError extends Error {
  readonly status: 400 | 403 | 404
  readonly code: string

  constructor(code: string, status: 400 | 403 | 404, message = code) {
    super(message)
    this.name = 'ReferenceImportValidationError'
    this.code = code
    this.status = status
  }
}

export interface ReferenceImportSource {
  id: string
  workspaceId: string
  styleAnchorKey: string | null
  customStyleAnchor: unknown
}

interface PrepareReferenceImportInput {
  userId: string
  destinationWorkspaceId: string
  referenceProjectId: string
  destinationProjectId?: string
}

interface CopyReferenceAssetsInput {
  source: ReferenceImportSource
  destinationProjectId: string
  destinationWorkspaceId: string
  includeLastShotFrame?: boolean
}

interface SceneRow {
  id: string
  sort_order: number | null
}

interface ShotRow {
  scene_id: string
  sort_order: number | null
  storyboard_image: unknown
  rough_storyboard: unknown
}

const REFERENCE_DIR = 'reference'
const MAX_REFERENCE_DIGEST_CHARS = 1500

/**
 * 현재 프로젝트가 저장한 참조 프로젝트 ID를 읽는다.
 * 호출자는 먼저 현재 프로젝트의 소유권을 확인해야 한다.
 */
export async function getProjectReferenceId(projectId: string): Promise<string | null> {
  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .select('reference_project_id')
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error

  const referenceProjectId = project?.reference_project_id
  return typeof referenceProjectId === 'string' && referenceProjectId.trim()
    ? referenceProjectId.trim()
    : null
}

/**
 * 참조 프로젝트의 최신 내용을 매 요청 읽어 조립한다. 프로젝트→workspace 소유권과
 * workspace 요금제는 저장된 참조 ID와 무관하게 매번 다시 확인하며, 참조의 참조 ID는
 * 읽지 않아 한 단계만 노출한다.
 */
export async function buildReferenceDigest(
  referenceProjectId: string,
  requesterUserId: string,
): Promise<string | null> {
  const projectId = referenceProjectId.trim()
  if (!projectId) return null

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, workspace_id, title, settings, story_text, expanded_story')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project?.workspace_id) return null

  const { data: workspace, error: workspaceError } = await supabaseAdmin
    .from('workspaces')
    .select('id, owner_id, plan')
    .eq('id', project.workspace_id)
    .maybeSingle()
  if (workspaceError) throw workspaceError
  if (!workspace || workspace.owner_id !== requesterUserId || !canUseReference(workspace.plan)) {
    return null
  }

  const [{ data: characters, error: charactersError }, { data: locations, error: locationsError }] =
    await Promise.all([
      supabaseAdmin
        .from('characters')
        .select('*')
        .eq('project_id', projectId),
      supabaseAdmin
        .from('locations')
        .select('*')
        .eq('project_id', projectId),
    ])
  if (charactersError) throw charactersError
  if (locationsError) throw locationsError

  const title = typeof project.title === 'string' && project.title.trim()
    ? project.title.trim()
    : 'Untitled project'
  const sections = [
    `[Referenced Project: ${title}] (read-only background from a referenced project — not the current project's cards)`,
  ]

  const settings = stringifyReferenceValue(project.settings)
  if (settings) sections.push(`Settings:\n${settings}`)

  const cast = serializeReferenceRows(characters)
  if (cast) sections.push(`Cast:\n${cast}`)

  const backgrounds = serializeReferenceRows(locations)
  if (backgrounds) sections.push(`Backgrounds:\n${backgrounds}`)

  if (typeof project.story_text === 'string' && project.story_text.trim()) {
    sections.push(`Story Text:\n${project.story_text}`)
  }
  if (typeof project.expanded_story === 'string' && project.expanded_story.trim()) {
    sections.push(`Expanded Story:\n${project.expanded_story}`)
  }

  return sections.join('\n\n').slice(0, MAX_REFERENCE_DIGEST_CHARS)
}

function serializeReferenceRows(rows: unknown): string | null {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const serialized = rows
    .map((row) => stringifyReferenceValue(row))
    .filter((row): row is string => Boolean(row))
  return serialized.length > 0 ? serialized.map((row) => `- ${row}`).join('\n') : null
}

function stringifyReferenceValue(value: unknown): string | null {
  const pruned = pruneReferenceValue(value)
  if (pruned === undefined) return null
  try {
    const serialized = JSON.stringify(pruned)
    return serialized === undefined ? null : serialized
  } catch {
    return null
  }
}

function pruneReferenceValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value.trim() ? value : undefined
  if (Array.isArray(value)) {
    const items = value
      .map((item) => pruneReferenceValue(item))
      .filter((item) => item !== undefined)
    return items.length > 0 ? items : undefined
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, pruneReferenceValue(item)] as const)
      .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined)
    return Object.fromEntries(entries)
  }
  return value
}

/**
 * 새 프로젝트를 만들기 전에 참조 프로젝트의 소유권·workspace·요금제 경계를 다시 확인한다.
 * 브라우저가 직접 쓸 수 있는 reference_project_id를 신뢰하지 않는 유일한 진입점이다.
 */
export async function prepareReferenceImport(
  input: PrepareReferenceImportInput,
): Promise<ReferenceImportSource> {
  const referenceProjectId = input.referenceProjectId.trim()
  if (!referenceProjectId) {
    throw new ReferenceImportValidationError(
      'reference_project_required',
      400,
      'A reference project is required.',
    )
  }
  if (input.destinationProjectId && input.destinationProjectId === referenceProjectId) {
    throw new ReferenceImportValidationError('reference_self', 400, 'A project cannot reference itself.')
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, workspace_id, style_anchor_key, custom_style_anchor')
    .eq('id', referenceProjectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project?.workspace_id || project.workspace_id !== input.destinationWorkspaceId) {
    // Deliberately do not distinguish a missing project from a project in another workspace.
    throw new ReferenceImportValidationError(
      'reference_not_found',
      404,
      'The reference project is not available.',
    )
  }

  const { data: workspace, error: workspaceError } = await supabaseAdmin
    .from('workspaces')
    .select('id, owner_id, plan')
    .eq('id', project.workspace_id)
    .maybeSingle()
  if (workspaceError) throw workspaceError
  if (!workspace || workspace.owner_id !== input.userId) {
    throw new ReferenceImportValidationError(
      'reference_not_found',
      404,
      'The reference project is not available.',
    )
  }
  if (!canUseReference(workspace.plan)) {
    throw new ReferenceImportValidationError(
      'reference_unavailable',
      403,
      'Reference import is not available for this plan.',
    )
  }

  return {
    id: project.id,
    workspaceId: project.workspace_id,
    styleAnchorKey: project.style_anchor_key ?? null,
    customStyleAnchor: project.custom_style_anchor,
  }
}

/**
 * 프로젝트 insert 뒤에만 호출한다. 복사는 media 버킷 내부의 storage copy만 사용하며,
 * 외부 주소는 절대 fetch하지 않는다. 원본 앵커·프레임이 없으면 정상적인 no-op이다.
 */
export async function copyReferenceAssets(
  input: CopyReferenceAssetsInput,
): Promise<{ warnings: ReferenceImportWarning[] }> {
  const warnings: ReferenceImportWarning[] = []
  const updates: Record<string, unknown> = {}

  if (input.source.styleAnchorKey) {
    updates.style_anchor_key = input.source.styleAnchorKey
  }

  const custom = parseCustomStyleAnchor(input.source.customStyleAnchor)
  if (custom) {
    const copied = await tryCopyOwnMedia(
      custom.url,
      input.destinationWorkspaceId,
      input.destinationProjectId,
      input.source.id,
      'style-anchor',
    )
    if (copied.ok) {
      updates.custom_style_anchor = {
        url: copied.url,
        label: custom.label,
        medium: custom.medium,
      }
    } else {
      warnings.push({
        code: 'style_anchor_copy_failed',
        detail: copied.detail,
      })
      console.error('[project/new] anchor copy failed', copied.detail)
    }
  }

  if (input.includeLastShotFrame) {
    let frameUrl: string | null = null
    try {
      frameUrl = await findLastShotStartFrame(input.source.id)
    } catch (error) {
      const detail = errorMessage(error)
      warnings.push({ code: 'reference_frame_copy_failed', detail })
      console.error('[project/new] reference frame lookup failed', detail)
    }
    if (frameUrl) {
      const copied = await tryCopyOwnMedia(
        frameUrl,
        input.destinationWorkspaceId,
        input.destinationProjectId,
        input.source.id,
        'last-shot-start',
      )
      if (copied.ok) {
        updates.optional_reference_frame_url = copied.url
      } else {
        warnings.push({
          code: 'reference_frame_copy_failed',
          detail: copied.detail,
        })
        console.error('[project/new] reference frame copy failed', copied.detail)
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    try {
      const { error } = await supabaseAdmin
        .from('projects')
        .update(updates)
        .eq('id', input.destinationProjectId)
        .eq('workspace_id', input.destinationWorkspaceId)
      if (error) {
        throw error
      }
    } catch (error) {
      const detail = errorMessage(error)
      if (updates.custom_style_anchor || updates.style_anchor_key) {
        warnings.push({ code: 'style_anchor_copy_failed', detail })
      }
      if (updates.optional_reference_frame_url) {
        warnings.push({ code: 'reference_frame_copy_failed', detail })
      }
      console.error('[project/new] reference snapshot update failed', detail)
    }
  }

  return { warnings }
}

async function tryCopyOwnMedia(
  url: string,
  workspaceId: string,
  projectId: string,
  sourceProjectId: string,
  kind: 'style-anchor' | 'last-shot-start',
): Promise<{ ok: true; url: string } | { ok: false; detail: string }> {
  try {
    return await copyOwnMedia(
      url,
      workspaceId,
      projectId,
      sourceProjectId,
      kind,
    )
  } catch (error) {
    return {
      ok: false,
      detail: errorMessage(error),
    }
  }
}

async function copyOwnMedia(
  url: string,
  workspaceId: string,
  projectId: string,
  sourceProjectId: string,
  kind: 'style-anchor' | 'last-shot-start',
): Promise<{ ok: true; url: string } | { ok: false; detail: string }> {
  if (!isOwnMediaUrl(url)) {
    return { ok: false, detail: 'source URL is outside the media bucket' }
  }
  const sourcePath = mediaPathFromUrl(url)
  if (!sourcePath) {
    return { ok: false, detail: 'source URL is not a valid media path' }
  }

  const extension = extensionFromPath(sourcePath)
  const destinationPath = `${workspaceId}/${projectId}/${REFERENCE_DIR}/${kind}-${storageKeySegment(sourceProjectId)}${extension}`
  const { error } = await mediaCopy(sourcePath, destinationPath)
  if (error) {
    return {
      ok: false,
      detail: errorMessage(error),
    }
  }
  return { ok: true, url: mediaPublicUrl(destinationPath) }
}

function extensionFromPath(path: string): string {
  const match = path.match(/\.[a-z0-9]{1,8}$/i)
  return match?.[0] ?? '.bin'
}

async function findLastShotStartFrame(projectId: string): Promise<string | null> {
  const { data: scenes, error: sceneError } = await supabaseAdmin
    .from('scenes')
    .select('id, sort_order')
    .eq('project_id', projectId)
  if (sceneError) throw sceneError

  const { data: shots, error: shotError } = await supabaseAdmin
    .from('shots')
    .select('scene_id, sort_order, storyboard_image, rough_storyboard')
    .eq('project_id', projectId)
  if (shotError) throw shotError

  const sceneRows = (scenes ?? []) as SceneRow[]
  const sceneRank = new Map(sceneRows.map((scene) => [scene.id, scene.sort_order ?? -Infinity]))
  const shotRows = (shots ?? []) as ShotRow[]
  const lastShot = [...shotRows].sort((a, b) => {
    const sceneDelta = (sceneRank.get(b.scene_id) ?? -Infinity) - (sceneRank.get(a.scene_id) ?? -Infinity)
    if (sceneDelta !== 0) return sceneDelta
    return (b.sort_order ?? -Infinity) - (a.sort_order ?? -Infinity)
  })[0]
  if (!lastShot) return null

  return (
    startFrameFromImage(lastShot.storyboard_image) ??
    startFrameFromImage(lastShot.rough_storyboard)
  )
}

function startFrameFromImage(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const image = raw as {
    status?: unknown
    frames?: { start?: unknown } | null
    url?: unknown
  }
  if (typeof image.status === 'string' && image.status !== 'completed') return null
  return typeof image.frames?.start === 'string' && image.frames.start.trim()
    ? image.frames.start.trim()
    : null
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return String(error)
}
