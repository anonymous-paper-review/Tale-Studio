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
    renderPrompts: recordProjection(state.renderPrompts),
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
