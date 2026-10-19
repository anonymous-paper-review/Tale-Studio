// 산문 확정(리뉴얼 1차 2026-10-19, 프로토타입 W6 "산문을 확정할까요? · 예, 확정하기").
//   Writer 의 [브레이크다운하기]를 확정하면 산문을 잠그고(_proseLocked) Artist 단계를 연다(current_stage = artist).
//   실행은 이어 가지 않는다 — 확정을 기다리는 산문 초안 그대로 두고, 인물 · 배경 디자인은 Artist [만들기]가 이어 간다.
//   잠긴 산문은 scene-gate 가 고치는 요청을 받지 않는다. 넘길 때 러닝타임 검사는 없다(프로토타입 "러닝타임 검사 없음").
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'
import { getActiveRun } from '@/lib/writer/run-store'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

export const runtime = 'nodejs'

const bodySchema = z.object({ projectId: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid prose confirm request' }, { status: 400 })
    const access = await requireProjectAccess(req, parsed.data.projectId)
    if (!access.ok) return access.response

    for (let attempt = 0; attempt < 3; attempt++) {
      const run = await getActiveRun(access.projectId)
      const state = run?.state as WriterRunState | undefined
      if (!run || run.status !== 'awaiting_confirmation' || !state?.scenes?.scenes?.length) {
        return NextResponse.json({ error: 'No prose to confirm', code: 'prose_missing' }, { status: 409 })
      }
      if (state._sceneStoryProposal) {
        return NextResponse.json({ error: 'Apply or discard the AI proposal first', code: 'scene_story_proposal_pending' }, { status: 409 })
      }
      if (state._proseLocked !== true) {
        const updatedAt = new Date(Math.max(Date.now(), new Date(run.updated_at).getTime() + 1)).toISOString()
        const next: WriterRunState = { ...state, _proseLocked: true }
        // 적용 직전으로 되돌리기는 확정과 함께 거둔다 — 잠긴 산문은 되돌리지 않는다.
        delete next._sceneStoryUndo
        const { data, error } = await supabaseAdmin
          .from('writer_runs')
          .update({ state: next, status: 'awaiting_confirmation', updated_at: updatedAt })
          .eq('id', run.id)
          .eq('status', 'awaiting_confirmation')
          .eq('updated_at', run.updated_at)
          .select('id')
        if (error) throw new Error(error.message)
        if (!data?.length) continue
      }
      // Artist 를 연다 — 이미 Artist · Storyboard 로 간 프로젝트의 단계는 되돌리지 않는다.
      const { error: stageError } = await supabaseAdmin
        .from('projects')
        .update({ current_stage: 'artist' })
        .eq('id', access.projectId)
        .in('current_stage', ['entry', 'producer'])
      if (stageError) throw new Error(stageError.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'The prose changed. Please try again.', code: 'scene_story_changed' }, { status: 409 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/prose-confirm]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
