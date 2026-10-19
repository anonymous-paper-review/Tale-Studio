// Artist [완료하기] (리뉴얼 1차 2026-10-19, 프로토타입 A9) — 인물 · 배경 대표 그림이 다 있으면
//   인물 · 배경 디자인 뒤 멈춘 실행(awaiting_artist)을 이어 씬 · 샷 나누기(08~15)를 돌리고 Storyboard(id writer)를 연다.
//   목록(인물 · 배경)은 이때 넘어간다 — 새 인물 · 배경은 산문으로 돌아가야 생긴다(롤백은 2차).
import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'
import { getActiveRun } from '@/lib/writer/run-store'
import { triggerWriterStep } from '@/lib/writer/pipeline/steps'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'
import { loadCompletionGaps } from '@/lib/artist/completion'

export const runtime = 'nodejs'

const requestSchema = z.object({ projectId: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const access = await requireProjectAccess(req, parsed.data.projectId)
    if (!access.ok) return access.response
    const projectId = access.projectId

    const missing = await loadCompletionGaps(projectId)
    if (missing.characters.length > 0 || missing.locations.length > 0) {
      return NextResponse.json(
        { error: 'Some characters or backgrounds have no image yet', code: 'artist_images_missing', missing },
        { status: 409 },
      )
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const run = await getActiveRun(projectId)
      if (!run || run.status !== 'awaiting_artist') {
        return NextResponse.json(
          { error: 'No run is waiting for Artist to complete', code: 'artist_not_waiting', status: run?.status ?? null },
          { status: 409 },
        )
      }
      const state: WriterRunState = { ...(run.state as WriterRunState), _artistCompleted: true }
      const updatedAt = new Date(Math.max(Date.now(), new Date(run.updated_at).getTime() + 1)).toISOString()
      const { data, error } = await supabaseAdmin
        .from('writer_runs')
        .update({ state, status: 'running', updated_at: updatedAt })
        .eq('id', run.id)
        .eq('status', 'awaiting_artist')
        .eq('updated_at', run.updated_at)
        .select('id')
      if (error) throw new Error(`artist complete failed: ${error.message}`)
      if (!data?.length) continue

      // Storyboard 를 연다 — 이미 더 뒤(Director · Editor)면 낮추지 않는다.
      const { error: stageError } = await supabaseAdmin
        .from('projects')
        .update({ current_stage: 'writer' })
        .eq('id', projectId)
        .in('current_stage', ['entry', 'producer', 'artist'])
      if (stageError) console.error('[artist-complete] stage update failed:', stageError.message)

      after(async () => {
        await triggerWriterStep(req.nextUrl.origin, projectId)
      })
      return NextResponse.json({ ok: true, projectId, runId: run.id })
    }
    return NextResponse.json({ error: 'The run changed; try again', code: 'artist_run_changed' }, { status: 409 })
  } catch (err) {
    console.error('[artist-complete] failed:', err)
    return NextResponse.json({ error: 'Could not complete Artist' }, { status: 500 })
  }
}
