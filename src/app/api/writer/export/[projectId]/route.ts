import { NextResponse } from 'next/server'

import { userOwnsProject } from '@/lib/generation-jobs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

type WriterRunStatus = 'running' | 'completed' | 'failed' | string

interface WriterRunForExport {
  id: string
  status: WriterRunStatus
  state: Record<string, unknown> | null
  created_at: string | null
}

interface WriterExportProjection {
  storyBible: {
    genre: unknown | null
    narrativeStructure: unknown | null
    characters: unknown | null
  } | null
  scenes: unknown[] | null
  shotDesign: unknown[] | null
  renderPrompts: Record<string, unknown> | null
}

const EMPTY_PROJECTION: WriterExportProjection = {
  storyBible: null,
  scenes: null,
  shotDesign: null,
  renderPrompts: null,
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId } = await params
  if (!(await userOwnsProject(projectId, user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const runs = await listRecentRuns(projectId)
  let chosen = chooseExportRun(runs)

  if (!runs.some((run) => run.status === 'completed' && hasUsableState(run.state))) {
    const latestCompleted = await loadLatestCompletedRun(projectId)
    if (latestCompleted && hasUsableState(latestCompleted.state)) chosen = latestCompleted
  }

  return NextResponse.json(chosen ? projectStateToProjection(chosen.state) : EMPTY_PROJECTION)
}

async function listRecentRuns(projectId: string): Promise<WriterRunForExport[]> {
  const { data, error } = await supabaseAdmin
    .from('writer_runs')
    .select('id,status,state,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) throw new Error(`writer export run load failed: ${error.message}`)
  return ((data ?? []) as WriterRunForExport[]).filter((run) => isRecord(run.state))
}

async function loadLatestCompletedRun(projectId: string): Promise<WriterRunForExport | null> {
  const { data, error } = await supabaseAdmin
    .from('writer_runs')
    .select('id,status,state,created_at')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`writer export run load failed: ${error.message}`)
  return (
    ((data ?? []) as WriterRunForExport[]).find(
      (run) => run.status === 'completed' && isRecord(run.state),
    ) ?? null
  )
}

function chooseExportRun(runs: WriterRunForExport[]): WriterRunForExport | null {
  return (
    runs.find((run) => run.status === 'completed' && hasUsableState(run.state)) ??
    runs.find((run) => hasUsableState(run.state)) ??
    null
  )
}

function hasUsableState(state: Record<string, unknown> | null): boolean {
  return projectionHasAnyStage(projectStateToProjection(state))
}

function projectStateToProjection(state: Record<string, unknown> | null): WriterExportProjection {
  if (!state) return EMPTY_PROJECTION

  return {
    storyBible: storyBibleProjection(state),
    scenes: scenesProjection(state.scenes),
    shotDesign: arrayProjection(state.shotDesign),
    renderPrompts: renderPromptsProjection(state),
  }
}

/**
 * 렌더 프롬프트 투영 — v5 스테이지 제거(#writer-overhaul 2026-08-10) 후의 소스.
 *   v5 는 shotSequence 가 이미 확정한 두 프롬프트(first_frame_generation.composition_prompt /
 *   video_generation.motion_prompt)를 같은 우선순위로 재추출해 담기만 했고, 그 산출물의
 *   유일한 소비자가 이 export 였다. 스테이지를 걷어내고 여기서 같은 규칙으로 파생한다.
 *   구 run(state.renderPrompts 보유)은 그 값을 그대로 써 과거 export 와 바이트 동일.
 */
function renderPromptsProjection(state: Record<string, unknown>): Record<string, unknown> | null {
  const legacy = recordProjection(state.renderPrompts)
  if (legacy) return legacy

  const sequence = recordProjection(state.shotSequence)
  const shots = Array.isArray(sequence?.shots) ? sequence.shots.filter(isRecord) : []
  if (!shots.length) return null

  return {
    total_shots: shots.length,
    shots: shots.map((shot) => {
      const duration = shot.duration_seconds
      return {
        shot_id: shot.shot_id,
        scene_id: recordProjection(shot.S)?.scene_id ?? shot.scene_id ?? '',
        duration_seconds: duration,
        // v5 extractT2IPrompt/extractTI2VPrompt 와 동일한 우선순위(조립 출력 → v4 스펙 원본).
        t2i: {
          prompt:
            recordProjection(shot.first_frame_generation)?.composition_prompt ??
            recordProjection(shot.static_spec)?.first_frame_prompt ??
            '',
        },
        ti2v: {
          motion_prompt:
            recordProjection(shot.video_generation)?.motion_prompt ??
            recordProjection(shot.dynamic_spec)?.motion_prompt ??
            '',
          duration_seconds: duration,
        },
      }
    }),
  }
}

function storyBibleProjection(state: Record<string, unknown>): WriterExportProjection['storyBible'] {
  const genre = state.genre ?? null
  const narrativeStructure = state.narrativeStructure ?? null
  const characters = state.characters ?? null

  if (genre == null && narrativeStructure == null && characters == null) return null
  return { genre, narrativeStructure, characters }
}

function scenesProjection(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return null
  return arrayProjection(value.scenes)
}

function arrayProjection(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function recordProjection(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function projectionHasAnyStage(projection: WriterExportProjection): boolean {
  return (
    projection.storyBible !== null ||
    projection.scenes !== null ||
    projection.shotDesign !== null ||
    projection.renderPrompts !== null
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
