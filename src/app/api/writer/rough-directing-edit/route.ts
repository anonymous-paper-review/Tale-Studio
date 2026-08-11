// POST /api/writer/rough-directing-edit — 연출 화살표 레이어 편집(#arrow-layer 실험 2026-08-09).
//   separate: DIRECTING 프레임에서 화살표를 지운 클린 플레이트 생성(Grok i2i, generatedAt 캐시)
//   save: 편집기가 평탄화한 PNG 를 direction 프레임 경로에 upsert + 캐시버스트
// 얇은 라우트 — 인증·검증만 하고 lib(directing-edit)에 위임.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import {
  separateArrowLayer,
  saveDirectingFrame,
  regenerateEndFrame,
} from '@/lib/writer/directing-edit'

export const runtime = 'nodejs'
export const maxDuration = 120 // Grok i2i 동기 생성(수십 초) 대기

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('separate'),
    projectId: z.string().uuid(),
    shotId: z.string().min(1),
  }),
  z.object({
    action: z.literal('save'),
    projectId: z.string().uuid(),
    shotId: z.string().min(1),
    // PNG data URL — base64 오버헤드 포함 상한(디코드 후 15MB 는 lib 이 재검증)
    image: z.string().max(21_000_000),
  }),
  z.object({
    // 편집한 DIRECTING 을 참조로 END 프레임만 다시 그린다(#end-from-direction).
    action: z.literal('regenerate-end'),
    projectId: z.string().uuid(),
    shotId: z.string().min(1),
  }),
])

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
    const body = parsed.data
    if (!(await userOwnsProject(body.projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (body.action === 'separate') {
      const data = await separateArrowLayer(body.projectId, body.shotId)
      return NextResponse.json({ data })
    }
    if (body.action === 'regenerate-end') {
      const data = await regenerateEndFrame(body.projectId, body.shotId)
      return NextResponse.json({ data })
    }
    const data = await saveDirectingFrame(body.projectId, body.shotId, body.image)
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/rough-directing-edit]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
