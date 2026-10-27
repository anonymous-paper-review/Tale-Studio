// 산문 재점검 반영(2026-10-27 오너 · 디자이너 QA 2차, 프로토타입 WT [목록에 반영]).
//   산문을 확정한 뒤 [만들기] 전, 브레이크다운 창에서 고친 것(넣기 · 이름 고치기 · 합치기)을 Writer 실행 기록과
//   브레이크다운 목록(projects.producer_draft)에 함께 얹는다. 빼기는 받지 않는다(오너 결정 3). 산문 글은 그대로다.
//   규칙은 src/lib/writer/breakdown-recheck.ts — 이 라우트는 주인 확인 · 입력 검증 · 읽은 시각 비교 저장만 한다.
//   약속: tests/artist/recheck-route.test.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { getActiveRun } from '@/lib/writer/run-store'
import { breakdownRecheckBlock, draftLists, planBreakdownRecheck } from '@/lib/writer/breakdown-recheck'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

export const runtime = 'nodejs'

const kindSchema = z.enum(['person', 'background'])
const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), kind: kindSchema, name: z.string().min(1).max(100) }),
  z.object({ op: z.literal('rename'), key: z.string().min(1).max(200), name: z.string().min(1).max(100) }),
  z.object({ op: z.literal('merge'), from: z.string().min(1).max(200), into: z.string().min(1).max(200) }),
])
// kept: 창에 보이지 않던 줄(시리즈 다음 화의 "보관") — 창과 같게 비교 대상에서 빼고 목록에는 그대로 남긴다(2026-10-27 검토).
const bodySchema = z.object({
  projectId: z.string().min(1),
  ops: z.array(opSchema).min(1).max(200),
  kept: z.array(z.string().min(1).max(200)).max(500).optional(),
})

const listChanged = () => NextResponse.json({ error: 'The list changed. Open the re-check again.', code: 'list_changed' }, { status: 409 })

export async function POST(req: NextRequest) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid re-check request' }, { status: 400 })
    const access = await requireProjectAccess(req, parsed.data.projectId)
    if (!access.ok) return access.response

    for (let attempt = 0; attempt < 3; attempt++) {
      const run = await getActiveRun(access.projectId)
      const block = breakdownRecheckBlock(run)
      if (block || !run) return NextResponse.json({ error: 'The list cannot be re-checked now', code: block ?? 'breakdown_closed' }, { status: 409 })

      const { data: project, error: projectError } = await supabaseAdmin
        .from('projects')
        .select('producer_draft')
        .eq('id', access.projectId)
        .maybeSingle()
      if (projectError) throw new Error(projectError.message)
      const rawDraft = (project as { producer_draft?: unknown } | null)?.producer_draft
      const lists = draftLists(rawDraft)
      if (!lists) return NextResponse.json({ error: 'The list is not saved yet', code: 'list_missing' }, { status: 409 })

      const plan = planBreakdownRecheck({ state: run.state as WriterRunState, cast: lists.cast, backgrounds: lists.backgrounds, ops: parsed.data.ops, kept: parsed.data.kept })
      // 목록에 없는 줄 — 다른 창에서 먼저 반영해 합쳐졌거나 지워졌다. 옛 목록으로 고친 것을 얹지 않는다.
      if (!plan.ok) return plan.code === 'unknown_entry' ? listChanged() : NextResponse.json({ error: 'The re-check was not accepted', code: plan.code }, { status: 409 })

      // 읽은 뒤 다른 곳(다른 창 · [만들기])에서 실행 기록이 바뀌었으면 쓰지 않고 다시 읽어 계산한다(산문 확정과 같은 방식).
      const updatedAt = new Date(Math.max(Date.now(), new Date(run.updated_at).getTime() + 1)).toISOString()
      const { data: written, error: runError } = await supabaseAdmin
        .from('writer_runs')
        .update({ state: plan.state, status: 'awaiting_confirmation', updated_at: updatedAt })
        .eq('id', run.id)
        .eq('status', 'awaiting_confirmation')
        .eq('updated_at', run.updated_at)
        .select('id')
      if (runError) throw new Error(runError.message)
      if (!written?.length) continue

      const draft = { ...(rawDraft as Record<string, unknown>), cast: plan.cast, backgrounds: plan.backgrounds, savedAt: Date.now() }
      const { error: draftError } = await supabaseAdmin.from('projects').update({ producer_draft: draft }).eq('id', access.projectId)
      if (draftError) {
        // 목록을 쓰지 못했으면 실행 기록도 되돌린다 — 화면 목록에 없는 인물을 [만들기]가 그리지 않게.
        //   되돌리지 못하면 실행 기록에만 인물이 남는다 — 다음 넣기가 같은 이름이면 그 인물을 다시 쓴다(planBreakdownRecheck). 기록은 남긴다.
        const { data: restored, error: restoreError } = await supabaseAdmin
          .from('writer_runs')
          .update({ state: run.state, status: 'awaiting_confirmation', updated_at: new Date(new Date(updatedAt).getTime() + 1).toISOString() })
          .eq('id', run.id)
          .eq('updated_at', updatedAt)
          .select('id')
        if (restoreError || !restored?.length) {
          console.error('[writer/breakdown-recheck] run rollback failed after the list save failed:', restoreError?.message ?? 'the run changed meanwhile')
        }
        throw new Error(draftError.message)
      }
      return NextResponse.json({ ok: true, cast: plan.cast, backgrounds: plan.backgrounds, newIds: plan.newLocalIds })
    }
    return listChanged()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/breakdown-recheck]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
