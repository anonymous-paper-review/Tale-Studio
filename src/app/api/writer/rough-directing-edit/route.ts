// POST /api/writer/rough-directing-edit — 연출 화살표 레이어 편집(#arrow-layer 실험 2026-08-09).
//   separate: DIRECTING 프레임에서 화살표를 지운 클린 플레이트 생성(Grok i2i, generatedAt 캐시)
//   save: 편집기가 평탄화한 PNG 를 direction 프레임 경로에 upsert + 캐시버스트
// 얇은 라우트 — 인증·검증만 하고 lib(directing-edit)에 위임.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { userOwnsProject } from '@/lib/generation-jobs'
import { capacityReservationRejection } from '@/lib/api/quota'
import { moderationRejectionResponse } from '@/lib/api/moderation'
import {
  ForeignMediaPathError,
  StaleDirectionError,
  separateArrowLayer,
  saveDirectingFrame,
  regenerateEndFrame,
  regenerateRoughFrame,
} from '@/lib/writer/directing-edit'

export const runtime = 'nodejs'
export const maxDuration = 120 // Grok i2i 동기 생성(수십 초) 대기

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('separate'),
    projectId: z.string().uuid(),
    shotId: z.string().min(1),
    // 화면이 보고 있는 연출 그림 주소 — 서버 그림과 다르면 그림 값을 쓰기 전에 409(검토 2026-11-14 낮음 2 ②). 옛 화면은 안 보낸다.
    direction: z.string().max(4000).optional(),
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
  z.object({
    // 약속 I(2026-09-04): 시작·연출·끝 중 한 장만 다시 그린다 — 나머지 두 장은 그대로.
    action: z.literal('regenerate-frame'),
    projectId: z.string().uuid(),
    shotId: z.string().min(1),
    frame: z.enum(['start', 'direction', 'end']),
  }),
])

export async function POST(req: Request) {
  let capacityContext: { projectId: string; kind: string; userId: string } | null = null
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const body = parsed.data
    if (!(await userOwnsProject(body.projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    capacityContext = { projectId: body.projectId, kind: 'image_generation', userId: user.id }

    // 덮어쓸 그림은 늘 이 프로젝트 폴더 안이어야 한다 — 주소가 브라우저가 고칠 수 있는 rough_storyboard 에서 온다(2026-11-01 리뷰 M5).
    if (body.action === 'separate') {
      const data = await separateArrowLayer(body.projectId, body.shotId, undefined, { projectFolderOnly: true, expectDirection: body.direction })
      return NextResponse.json({ data })
    }
    if (body.action === 'regenerate-end') {
      const data = await regenerateEndFrame(body.projectId, body.shotId, undefined, { projectFolderOnly: true })
      return NextResponse.json({ data })
    }
    if (body.action === 'regenerate-frame') {
      const data = await regenerateRoughFrame(body.projectId, body.shotId, body.frame, undefined, { projectFolderOnly: true })
      return NextResponse.json({ data })
    }
    const data = await saveDirectingFrame(body.projectId, body.shotId, body.image, undefined, { projectFolderOnly: true })
    return NextResponse.json({ data })
  } catch (e) {
    if (e instanceof ForeignMediaPathError) return NextResponse.json({ error: e.message }, { status: 403 })
    if (e instanceof StaleDirectionError) return NextResponse.json({ error: e.message, code: 'stale_direction' }, { status: 409 })
    // 내용 규칙 거절·검사 장애도 자리 부족과 같은 자리에서 표준 상황코드로 바꾼다(#creem-moderation).
    const blocked = capacityContext && moderationRejectionResponse(e, capacityContext)
    if (blocked) return blocked
    const rejected = capacityContext && capacityReservationRejection(e, capacityContext)
    if (rejected) return rejected
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/rough-directing-edit]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
