// Artist [완료하기] (리뉴얼 1차 2026-10-19, 프로토타입 A9) — 인물 · 배경 대표 그림이 다 있으면 Storyboard(id writer)를 연다.
//   2026-10-20 오너 "Artist 만들면서 씬 · 샷 · Storyboard 도 같이": [만들기]가 디자인 뒤에도 멈추지 않고 씬 · 샷 나누기(08~15)를
//   이어 가므로, 완료하기는 그 실행을 건드리지 않고(두 번 시작하지 않는다) 단계만 연다. 10/19 배포 때 디자인 뒤에 멈춘
//   실행(awaiting_artist)은 예전처럼 이어 간다. 목록(인물 · 배경)은 이때 넘어간다 — 새 인물 · 배경은 산문으로 돌아가야 생긴다(롤백은 2차).
//   약속: tests/artist/artist-complete.test.ts
import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'
import { getActiveRun } from '@/lib/writer/run-store'
import { triggerWriterStep } from '@/lib/writer/pipeline/steps'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'
import { loadCompletionGaps } from '@/lib/artist/completion'
import { versionWorkPending } from '@/lib/artist/style-versions-server'

export const runtime = 'nodejs'
// 끊긴 버전 불러오기를 여기서 마저 할 수 있다 — 불러오기 창구와 같은 시간 제한(2026-10-31 재검토 지적). 끊겨도 그 시도는 센다.
export const maxDuration = 300

const requestSchema = z.object({ projectId: z.string().min(1) })

/** Storyboard 를 연다 — 이미 더 뒤(Director · Editor)면 낮추지 않는다. 열지 못하면 던진다(됐다고 하지 않는다). */
async function openStoryboard(projectId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('projects')
    .update({ current_stage: 'writer' })
    .eq('id', projectId)
    .in('current_stage', ['entry', 'producer', 'artist'])
  if (error) throw new Error(`stage update failed: ${error.message}`)
}

/** 인물 · 배경 디자인(05~07)과 그 앞(산문 01~04) 단계 — 이 단계에서 돌거나 멈춘 실행은 아직 넘길 디자인이 없다. */
const UNFINISHED_DESIGN_STEPS = new Set(['dramaturgy', 'narrativeStructure', 'scenes', 'storyCheck', 'visualFormat', 'actVisualArc', 'v2Design'])

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
    // 재생성 그림이 다 그려지기 전 · 버전을 불러오다 멈춘 채면 받지 않는다 — 옛 스타일 그림이 섞인 채로 Storyboard 가 열리면
    //   러프 · 샷이 섞인 그림으로 만들어진다. 화면 단추가 꺼져 있어도 다른 창 · 오래된 화면이 누를 수 있다(2026-10-28 검토 지적).
    const versionWork = await versionWorkPending(projectId)
    if (versionWork === 'regen') {
      return NextResponse.json({ error: 'The regenerated images are still being drawn', code: 'regen_pending' }, { status: 409 })
    }
    if (versionWork === 'restoring') {
      return NextResponse.json({ error: 'A version is still being loaded', code: 'version_restoring' }, { status: 409 })
    }
    if (versionWork === 'load_failed') {
      return NextResponse.json({ error: 'The version could not be fully loaded', code: 'version_load_failed' }, { status: 409 })
    }
    if (versionWork === 'unknown') {
      return NextResponse.json({ error: 'Could not check the version history', code: 'version_check_failed' }, { status: 409 })
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const run = await getActiveRun(projectId)
      // 아직 산문 초안인 실행([만들기] 전) — 넘길 디자인이 없다.
      if (run && (run.state as WriterRunState | undefined)?.input?.treatmentDraft === true) {
        return NextResponse.json(
          { error: 'Artist has not made the characters and backgrounds yet', code: 'artist_not_started', status: run.status },
          { status: 409 },
        )
      }
      // [만들기]로 이어 간 실행(씬 · 샷을 나누는 중 · 다 나눔 · 그 뒤에서 멈춤) — 실행은 그대로 두고 Storyboard 를 연다.
      //   멈췄으면 Storyboard 가 멈춘 이유와 [이어서 재시도]를 보인다. 인물 · 배경 디자인 중이거나 그 앞에서 멈췄으면 아직 받지 않는다.
      if (run && (run.status === 'running' || run.status === 'completed' || run.status === 'failed')) {
        // 디자인에서 멈췄으면 "아직 디자인 중"이 아니라 멈췄다고 알린다 — 화면 위 [이어서 재시도]로 이어 간다(검토 지적).
        if (run.status === 'failed' && UNFINISHED_DESIGN_STEPS.has(run.current_stage ?? '')) {
          return NextResponse.json(
            { error: 'Designing the characters and backgrounds stopped', code: 'artist_design_failed', status: run.status },
            { status: 409 },
          )
        }
        if (run.status !== 'completed' && UNFINISHED_DESIGN_STEPS.has(run.current_stage ?? '')) {
          return NextResponse.json(
            { error: 'Characters and backgrounds are still being designed', code: 'artist_design_unfinished', status: run.status },
            { status: 409 },
          )
        }
        await openStoryboard(projectId)
        return NextResponse.json({ ok: true, projectId, runId: run.id, status: run.status })
      }
      if (!run || run.status !== 'awaiting_artist') {
        return NextResponse.json(
          { error: 'Artist has not made the characters and backgrounds yet', code: 'artist_not_started', status: run?.status ?? null },
          { status: 409 },
        )
      }
      // Storyboard 를 먼저 연다 — 실행만 이어 두고 열지 못하면, 다시 누를 때 "아직 디자인 중"으로 막히고
      //   실행은 한동안 아무도 깨우지 않는다(검토 지적). 열기는 몇 번 해도 같다.
      await openStoryboard(projectId)
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
