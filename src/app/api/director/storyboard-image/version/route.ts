// POST /api/director/storyboard-image/version { projectId, writerShotId, versionId } — 실사 이미지 버전 고르기(디자이너 11/13 D6 · 오너 2026-11-14 답 5번 · 리드 A).
//   다시 만들지 않고(Take 0) 그 버전이 지금 그림이 된다 — 위 칸(url · frames)을 그 버전으로 바꾼다. 다른 버전은 그대로 남는다.
//   약속: tests/director/image-versions-select.test.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { userOwnsProject } from '@/lib/generation-jobs'
import { updateStoryboardImage } from '@/lib/director/storyboard-image-store'
import { selectStoryboardVersion } from '@/lib/director/storyboard-image-versions'

const bodySchema = z.object({
  projectId: z.string().min(1),
  writerShotId: z.string().min(1),
  versionId: z.string().min(1).max(200),
})

export async function POST(req: Request) {
  const blocked = demoWriteBlock(req)
  if (blocked) return blocked
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request: projectId, writerShotId and versionId are required' }, { status: 400 })
  const { projectId, writerShotId, versionId } = parsed.data
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await userOwnsProject(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    let found = false
    const image = await updateStoryboardImage(projectId, writerShotId, (current) => {
      const next = selectStoryboardVersion(current, versionId)
      found = !!next
      return next
    })
    if (!found || !image) return NextResponse.json({ error: 'Image version not found' }, { status: 404 })
    return NextResponse.json({ image })
  } catch (error) {
    console.error('[director/storyboard-image/version]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Unable to choose the image version' }, { status: 500 })
  }
}
