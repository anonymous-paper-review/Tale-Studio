import 'server-only'

import { supabaseAdmin } from '@/lib/supabase/admin'
import { STAGES } from '@/lib/constants'
import { evaluateArtistGate, evaluateDirectorGate, type LifecycleGateIssue, type WriterGateStatus } from '@/lib/lifecycle'
import { mainImageFromAppearances } from '@/lib/artist/main-image'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'

export interface ProjectHandoffIssue {
  code: string
  label: string
  action: string
  stage: 'writer' | 'artist'
}

export interface ProjectHandoffResult {
  ready: boolean
  blockers: ProjectHandoffIssue[]
  warnings: ProjectHandoffIssue[]
  counts: { scenes: number; shots: number }
  path?: '/studio/director'
}

export class ProjectHandoffError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message)
    this.name = 'ProjectHandoffError'
  }
}

interface QueryResult<T> { data: T | null; error: { message?: string } | null; count?: number | null }
interface ProjectRow { id: string; workspace_id: string; current_stage: string }
interface CharacterRow { character_id: string; name: string; entity_type: string; appearance: string | null; view_main: string | null }
interface AppearanceRow { character_id: string; is_default: boolean; appearance: string | null; sheet_url: string | null }
interface WorldRow { location_id: string; name: string; wide_shot: string | null }

const CHECK_FAILED = 'Could not check the handoff requirements. Please try again.'
const SAVE_FAILED = 'Could not save the stage change. Please try again.'
const CONFLICT = 'The project changed while handing over. Please try again.'

function checked<T>(result: QueryResult<T>, locale: AppLocale): T | null {
  if (result.error) throw new ProjectHandoffError('handoff_check_failed', 503, translate(locale, CHECK_FAILED))
  return result.data
}

function checkedRows<T>(result: QueryResult<T[]>, locale: AppLocale): T[] {
  const rows = checked(result, locale)
  // 누락·서버 행 상한을 실제 준비 완료로 취급하지 않는다.
  if (!Array.isArray(rows) || (result.count != null && result.count > rows.length)) {
    throw new ProjectHandoffError('handoff_check_failed', 503, translate(locale, CHECK_FAILED))
  }
  return rows
}

function checkedCount(result: QueryResult<unknown>, locale: AppLocale): number {
  checked(result, locale)
  if (typeof result.count !== 'number' || !Number.isFinite(result.count)) {
    throw new ProjectHandoffError('handoff_check_failed', 503, translate(locale, CHECK_FAILED))
  }
  return result.count
}

async function readProject(projectId: string, locale: AppLocale): Promise<ProjectRow> {
  const result = await supabaseAdmin.from('projects').select('id, workspace_id, current_stage').eq('id', projectId).maybeSingle()
  const project = checked<ProjectRow>(result, locale)
  if (!project) throw new ProjectHandoffError('forbidden', 403, 'Forbidden')
  return project
}

/** 저장된 원천으로 준비를 판정한다. check는 읽기 전용이고 move만 도달 단계를 전진시킨다. */
export async function prepareProjectHandoff(
  projectId: string,
  userId: string,
  action: 'check' | 'move',
  locale: AppLocale,
): Promise<ProjectHandoffResult> {
  const project = await readProject(projectId, locale)
  const workspaceResult = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', project.workspace_id).maybeSingle()
  const workspace = checked<{ owner_id: string }>(workspaceResult, locale)
  if (!workspace || workspace.owner_id !== userId) throw new ProjectHandoffError('forbidden', 403, 'Forbidden')

  const [runResult, sceneResult, shotResult, characterResult, appearanceResult, worldResult] = await Promise.all([
    supabaseAdmin.from('writer_runs').select('id, status').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('scenes').select('scene_id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabaseAdmin.from('shots').select('shot_id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabaseAdmin.from('characters').select('character_id, name, entity_type, appearance, view_main', { count: 'exact' }).eq('project_id', projectId),
    supabaseAdmin.from('character_appearances').select('character_id, is_default, appearance, sheet_url', { count: 'exact' }).eq('project_id', projectId).order('is_default', { ascending: false }),
    supabaseAdmin.from('locations').select('location_id, name, wide_shot', { count: 'exact' }).eq('project_id', projectId),
  ])
  const run = checked<{ id: string; status: string }>(runResult, locale)
  const counts = { scenes: checkedCount(sceneResult, locale), shots: checkedCount(shotResult, locale) }
  const characters = checkedRows<CharacterRow>(characterResult, locale)
  const appearances = checkedRows<AppearanceRow>(appearanceResult, locale)
  const worlds = checkedRows<WorldRow>(worldResult, locale)
  const writerBlockers: LifecycleGateIssue[] = []
  let writerState: WriterGateStatus['state'] = 'ready'
  let writerAction = translate(locale, 'Prepare and save the scenes and shots in Writer.')
  if (!run) {
    writerState = 'unknown'
    writerBlockers.push({ field: 'writer:missing', label: translate(locale, 'No completed Writer run was found.') })
  } else if (run.status === 'failed') {
    writerState = 'failed'
    writerBlockers.push({ field: 'writer:failed', label: translate(locale, 'Scenes and shots have not finished.') })
    writerAction = translate(locale, 'Check the error in Writer and resume the work.')
  } else if (run.status === 'awaiting_confirmation') {
    writerState = 'not_ready'
    writerBlockers.push({ field: 'writer:confirmation', label: translate(locale, 'Waiting for scene draft confirmation') })
    writerAction = translate(locale, 'Review and confirm the draft to continue.')
  } else if (run.status !== 'completed') {
    writerState = 'active'
    writerBlockers.push({ field: 'writer:active', label: translate(locale, 'Scenes and shots are still being prepared.') })
    writerAction = translate(locale, 'Wait for Writer to finish, then try handing over again.')
  }
  if (counts.scenes === 0 || counts.shots === 0) {
    if (writerState === 'ready') writerState = 'not_ready'
    writerBlockers.push({ field: 'writer:output', label: translate(locale, 'Saved scenes and shots are missing.') })
  }

  const artist = evaluateArtistGate({
    characters: characters.map(character => ({
      characterId: character.character_id, name: character.name, entityType: character.entity_type,
      // 기본 모습의 원천 외형을 먼저 읽고, 이전 프로젝트는 예전 설명으로 보완한다.
      appearance: appearances.find(appearance => appearance.character_id === character.character_id && appearance.is_default)?.appearance ?? character.appearance,
      // Artist 화면과 같은 권위: 기본 모습 시트 → 시트가 있는 모습 → 예전 대표 이미지.
      mainImageUrl: mainImageFromAppearances(character.view_main, appearances
        .filter(appearance => appearance.character_id === character.character_id)
        .map(appearance => ({ isDefault: appearance.is_default, sheetUrl: appearance.sheet_url }))),
    })),
    worlds: worlds.map(world => ({ locationId: world.location_id, name: world.name, wideShot: world.wide_shot })),
    locale,
  })
  const gate = evaluateDirectorGate({ writer: { state: writerState, blockers: writerBlockers }, artist, locale })
  const issue = (value: LifecycleGateIssue, warning = false): ProjectHandoffIssue => ({
    code: value.field, label: value.label,
    stage: value.field.startsWith('writer:') ? 'writer' : 'artist',
    action: value.field.startsWith('writer:') ? writerAction : translate(locale, warning
      ? 'Review the supporting images in Artist.' : 'Prepare the required character images in Artist.'),
  })
  const result: ProjectHandoffResult = {
    ready: gate.ready, blockers: gate.blockers.map(value => issue(value)),
    warnings: gate.warnings.map(value => issue(value, true)), counts,
  }
  if (!result.ready || action === 'check') return result

  const directorIndex = STAGES.findIndex(stage => stage.id === 'director')
  const currentIndex = STAGES.findIndex(stage => stage.id === project.current_stage)
  if (currentIndex < 0) throw new ProjectHandoffError('handoff_conflict', 409, translate(locale, CONFLICT))
  if (currentIndex < directorIndex) {
    const saved = await supabaseAdmin.from('projects').update({ current_stage: 'director' })
      .eq('id', projectId).eq('current_stage', project.current_stage).select('id, current_stage').maybeSingle()
    if (saved.error) throw new ProjectHandoffError('handoff_save_failed', 503, translate(locale, SAVE_FAILED))
    if (!saved.data) {
      // 다른 요청이 이미 더 멀리 전진했을 때만 재조회한 저장본을 근거로 성공한다.
      const latest = await readProject(projectId, locale)
      if (STAGES.findIndex(stage => stage.id === latest.current_stage) < directorIndex) {
        throw new ProjectHandoffError('handoff_conflict', 409, translate(locale, CONFLICT))
      }
    } else if (saved.data.current_stage !== 'director') {
      throw new ProjectHandoffError('handoff_save_failed', 503, translate(locale, SAVE_FAILED))
    }
  }
  return { ...result, path: '/studio/director' }
}
