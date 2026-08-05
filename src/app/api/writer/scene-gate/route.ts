// 씬 스토리 게이트(#s3-gate 2026-08-05) — storyCheck 후 awaiting_confirmation 으로 멈춘 run 의
//   확정(confirm: 뒷단 진행) / 수정 요청(revise: scenes·storyCheck 를 지워 s3 재실행 → 다시 게이트).
//   수정 요청은 state._sceneRevisionNotes 에 누적돼 s3 프롬프트에 최우선 반영된다.
import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getActiveRun } from '@/lib/writer/run-store'
import { triggerWriterStep } from '@/lib/writer/pipeline/steps'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json()) as {
      projectId?: string
      action?: 'confirm' | 'revise'
      feedback?: string
    }
    const { projectId, action, feedback } = body
    if (!projectId || (action !== 'confirm' && action !== 'revise')) {
      return NextResponse.json({ error: 'projectId, action(confirm|revise) required' }, { status: 400 })
    }
    if (action === 'revise' && !feedback?.trim()) {
      return NextResponse.json({ error: '수정 요청 내용을 입력해 주세요' }, { status: 400 })
    }

    const run = await getActiveRun(projectId)
    if (!run || run.status !== 'awaiting_confirmation') {
      return NextResponse.json({ error: 'no awaiting run', status: run?.status ?? null }, { status: 409 })
    }

    const state = { ...(run.state as WriterRunState) }
    if (action === 'confirm') {
      state._gateConfirmed = true
    } else {
      // 개정: 씬 산출물을 비워 s3 가 재실행되게 하고, 피드백을 누적한다.
      delete (state as Record<string, unknown>).scenes
      delete (state as Record<string, unknown>).storyCheck
      state._sceneRevisionNotes = [...(state._sceneRevisionNotes ?? []), feedback!.trim()]
      state._attempt = undefined
    }

    // 상태 전이는 awaiting 가드 CAS — 동시 클릭/중복 요청은 한 번만 통과한다.
    const { data, error } = await supabaseAdmin
      .from('writer_runs')
      .update({ state, status: 'running', updated_at: new Date().toISOString() })
      .eq('id', run.id)
      .eq('status', 'awaiting_confirmation')
      .select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) {
      return NextResponse.json({ error: 'gate already resolved' }, { status: 409 })
    }

    after(async () => {
      await triggerWriterStep(req.nextUrl.origin, projectId)
    })
    return NextResponse.json({ ok: true, action })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/scene-gate]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
