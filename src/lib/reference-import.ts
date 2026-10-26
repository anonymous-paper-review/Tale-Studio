import { referenceAllowed } from '@/lib/quota-exempt'
import { isQuotaExemptUserId } from '@/lib/quota-exempt-server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  isOwnMediaUrl,
  mediaPathFromUrl,
} from '@/lib/storage/media-url'
import {
  mediaCopy,
  mediaPublicUrl,
} from '@/lib/storage/media'

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
  if (!workspace || workspace.owner_id !== requesterUserId || !referenceAllowed(workspace.plan, await isQuotaExemptUserId(requesterUserId))) {
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
 * 다음 화를 만들기 전에 앞 화의 소유권·workspace·요금제 경계를 다시 확인한다(series/create-next-episode).
 * 브라우저가 보낸 앞 화 번호를 신뢰하지 않는 유일한 진입점이다.
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
  // 할당량 면제(관리자 · 시연 계정)는 칸이 무제한이라 요금제와 상관없이 앞 화를 가져온다(2026-10-27 검토).
  if (!referenceAllowed(workspace.plan, await isQuotaExemptUserId(input.userId))) {
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

export type MediaCopyResult =
  | { ok: true; url: string }
  | { ok: false; detail: string }

/**
 * media 버킷 안의 그림을 받은 경로로 복사한다(확장자는 원본에서 가져와 붙인다).
 * 버킷 밖 주소는 복사하지 않고 실패로 돌려준다 — 외부 주소는 절대 fetch 하지 않는다.
 * 던지지 않는다: 호출자가 경고 · 실패 목록으로 모아 쓴다(시리즈 다음 화 그림 복사가 같이 쓴다).
 */
export async function copyOwnMediaTo(
  url: string,
  destinationPathWithoutExtension: string,
): Promise<MediaCopyResult> {
  try {
    if (!isOwnMediaUrl(url)) {
      return { ok: false, detail: 'source URL is outside the media bucket' }
    }
    const sourcePath = mediaPathFromUrl(url)
    if (!sourcePath) {
      return { ok: false, detail: 'source URL is not a valid media path' }
    }

    const destinationPath = `${destinationPathWithoutExtension}${extensionFromPath(sourcePath)}`
    const { error } = await mediaCopy(sourcePath, destinationPath)
    if (error) {
      return { ok: false, detail: errorMessage(error) }
    }
    return { ok: true, url: mediaPublicUrl(destinationPath) }
  } catch (error) {
    return { ok: false, detail: errorMessage(error) }
  }
}

function extensionFromPath(path: string): string {
  const match = path.match(/\.[a-z0-9]{1,8}$/i)
  return match?.[0] ?? '.bin'
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
