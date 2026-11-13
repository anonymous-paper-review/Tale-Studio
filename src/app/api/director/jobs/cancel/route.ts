// POST /api/director/jobs/cancel { projectId, jobIds } — 이미 보낸 이미지 · 영상 작업을 화면에서 멈춘다(디자이너 11/13 · 오너 2026-11-14 7번 · 리드 C).
//   fal 에서는 끝까지 돌고 Take 는 돌려주지 않는다. 멈추면 그 샷을 바로 다시 요청할 수 있고, 뒤늦게 끝난 결과는 기록(버전 · Take 목록)에만 남는다.
//   돌려주는 것: 멈춘 작업마다 함께 멈춘 샷(4샷 한 장이면 넷). 약속: tests/director/job-cancel.test.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { userOwnsProject } from '@/lib/generation-jobs'
import { cancelDirectorJobs } from '@/lib/director/job-cancellations'

const bodySchema = z.object({
  projectId: z.string().uuid(),
  jobIds: z.array(z.string().uuid()).min(1).max(100),
})

export async function POST(req: Request) {
  const blocked = demoWriteBlock(req)
  if (blocked) return blocked
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid request: projectId and jobIds are required' }, { status: 400 })
  const user = await getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { projectId, jobIds } = parsed.data
  if (!(await userOwnsProject(projectId, user.id))) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  try {
    const cancelled = await cancelDirectorJobs(projectId, jobIds, user.id)
    return NextResponse.json({ ok: true, data: { cancelled } })
  } catch (error) {
    console.error('[director/jobs/cancel]', error instanceof Error ? error.message : error)
    return NextResponse.json({ ok: false, error: 'Unable to stop the generation' }, { status: 500 })
  }
}
