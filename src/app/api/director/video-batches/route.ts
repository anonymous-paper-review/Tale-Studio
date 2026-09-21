import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { userOwnsProject } from '@/lib/generation-jobs'
import { prepareDirectorVideoSubmission } from '@/lib/director/video-submit'
import {
  cancelVideoBatch,
  createVideoBatch,
  getVideoBatchSummary,
  listVideoBatchSummaries,
} from '@/lib/director/batch-store'
import { continueVideoBatch } from '@/lib/director/batch-continue'
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

export const runtime = 'nodejs'
export const maxDuration = 300

const idSchema = z.string().uuid()
const startSchema = z.object({
  batchId: idSchema,
  projectId: idSchema,
  items: z.array(z.object({
    shotId: z.string().trim().min(1).max(200),
    request: z.record(z.string(), z.unknown()),
  })).min(1).max(100),
})

// #batch-resume: 신원·예약키·복구 증표·기존 테이크는 외부 요청에서 받지 않는다.
const INPUT_FIELDS = [
  'prompt', 'camera', 'lighting', 'cameraPreset', 'model', 'provider',
  'durationSeconds', 'aspectRatio', 'frameSource', 'referenceImageUrl',
  'referenceImageUrls', 'referenceImageRoles',
] as const

async function access(projectId: string) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await userOwnsProject(projectId, user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return user
}

function continueAfterResponse(batch: VideoBatchSummary) {
  if (batch.status !== 'running') return
  after(async () => {
    try {
      await continueVideoBatch({ batchId: batch.id, projectId: batch.projectId })
    } catch (error) {
      // 기록은 남겼으므로 다음 정기 확인이 같은 항목을 이어받는다.
      console.error('[video-batches] continuation failed:', error instanceof Error ? error.message : error)
    }
  })
}

export async function POST(req: Request) {
  const blocked = demoWriteBlock(req)
  if (blocked) return blocked
  try {
    const parsed = startSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid batch request' }, { status: 400 })
    const { projectId, batchId } = parsed.data
    const user = await access(projectId)
    if (user instanceof Response) return user
    if (new Set(parsed.data.items.map((item) => item.shotId)).size !== parsed.data.items.length) {
      return NextResponse.json({ error: 'Duplicate batch shot' }, { status: 400 })
    }

    const existing = await getVideoBatchSummary(batchId, projectId)
    if (existing) {
      continueAfterResponse(existing)
      return NextResponse.json({ batch: existing, skipped: [] })
    }

    const items: Parameters<typeof createVideoBatch>[0]['items'] = []
    const skipped: Array<{ shotId: string; reason: string }> = []
    for (const item of parsed.data.items) {
      const id = crypto.randomUUID()
      const body: Record<string, unknown> = {
        projectId, shotId: item.shotId, writerShotId: item.shotId, idempotencyKey: id,
      }
      for (const field of INPUT_FIELDS) {
        if (Object.hasOwn(item.request, field)) body[field] = item.request[field]
      }
      const prepared = await prepareDirectorVideoSubmission(new Request(req.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }), user.id)
      if (prepared instanceof Response) {
        if (prepared.status === 401 || prepared.status === 403) return prepared
        const detail = await prepared.json().catch(() => null)
        skipped.push({
          shotId: item.shotId,
          reason: typeof detail?.code === 'string' ? detail.code : 'video_input_unavailable',
        })
        continue
      }
      items.push({ id, shot_id: item.shotId, prepared })
    }
    if (!items.length) {
      return NextResponse.json({ error: 'No usable video inputs', skipped }, { status: 422 })
    }

    const batch = await createVideoBatch({ id: batchId, projectId, userId: user.id, items })
    continueAfterResponse(batch)
    return NextResponse.json({ batch, skipped })
  } catch (error) {
    console.error('[video-batches] start failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Unable to start video batch' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const query = new URL(req.url).searchParams
    const project = idSchema.safeParse(query.get('projectId'))
    const batchId = query.get('batchId')
    if (!project.success || (batchId !== null && !idSchema.safeParse(batchId).success)) {
      return NextResponse.json({ error: 'Invalid batch request' }, { status: 400 })
    }
    const user = await access(project.data)
    if (user instanceof Response) return user
    if (batchId) {
      const batch = await getVideoBatchSummary(batchId, project.data)
      return NextResponse.json({ batches: batch ? [batch] : [] })
    }
    return NextResponse.json({ batches: await listVideoBatchSummaries(project.data) })
  } catch (error) {
    console.error('[video-batches] read failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Unable to read video batches' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const blocked = demoWriteBlock(req)
  if (blocked) return blocked
  try {
    const query = new URL(req.url).searchParams
    const project = idSchema.safeParse(query.get('projectId'))
    const batch = idSchema.safeParse(query.get('batchId'))
    if (!project.success || !batch.success) {
      return NextResponse.json({ error: 'Invalid batch request' }, { status: 400 })
    }
    const user = await access(project.data)
    if (user instanceof Response) return user
    const stopped = await cancelVideoBatch(batch.data, project.data, user.id)
    return NextResponse.json({ batch: stopped })
  } catch (error) {
    console.error('[video-batches] cancel failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Unable to stop video batch' }, { status: 500 })
  }
}
