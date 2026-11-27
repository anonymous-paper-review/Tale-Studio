// POST /api/writer/rough-directing-edit — 연출 화살표 레이어 편집(#arrow-layer 실험 2026-08-09).
//   separate: DIRECTING 프레임에서 화살표를 지운 클린 플레이트 생성(Grok i2i, generatedAt 캐시)
//   save: 편집기가 평탄화한 PNG 를 direction 프레임 경로에 upsert + 캐시버스트
//   read-direction: 읽는 AI 가 지금 연출 장을 한 줄로 읽는다(이미 있으면 다시 읽지 않음) — 끝 장 물음 창 · 편집기 아래 줄(D10 ②)
//   regenerate-end · regenerate-frame(end): 끝 장 ② 작업을 내고 작업 번호를 돌려준다(그림은 작업 틀이 끼운다, D10 ②)
//   keep-line: 물음 창 [그대로] + 고친 줄 — 끝 장은 그리지 않고 고친 줄만 남긴다(영상이 쓴다, 리드 (A) · D2 2026-11-23)
// 얇은 라우트 — 인증·검증만 하고 lib(directing-edit)에 위임.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { UI_LOCALE_HEADER, requestUiLocale, type AppLocale } from '@/lib/locale'
import { userOwnsProject } from '@/lib/generation-jobs'
import { capacityReservationRejection } from '@/lib/api/quota'
import { moderationRejectionResponse } from '@/lib/api/moderation'
import {
  DirectionTranslateError,
  DirectionUnreadableError,
  ForeignMediaPathError,
  StaleDirectionError,
  keepEditedDirectionLine,
  readDirection,
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
    // 옛 요청 이름 — 끝 장 ② 작업과 같은 길(D10).
    action: z.literal('regenerate-end'),
    projectId: z.string().uuid(),
    shotId: z.string().min(1),
  }),
  z.object({
    // D10 ②: 지금 연출 장을 한 줄로 읽는다(이미 읽은 줄이 있으면 그것).
    action: z.literal('read-direction'),
    projectId: z.string().uuid(),
    shotId: z.string().min(1),
  }),
  z.object({
    // 약속 I(2026-09-04): 시작·연출·끝 중 한 장만 다시 그린다 — 나머지 두 장은 그대로. 끝 장은 ② 작업(사람이 고친 줄을 실을 수 있다).
    action: z.literal('regenerate-frame'),
    projectId: z.string().uuid(),
    shotId: z.string().min(1),
    frame: z.enum(['start', 'direction', 'end']),
    line: z.object({ text: z.string().trim().min(1).max(600), lang: z.enum(['ko', 'en']) }).nullish(),
  }),
  z.object({
    // 리드 (A) 2026-11-23: 물음 창 [그대로] + 고친 줄 — 끝 장은 그리지 않고 고친 줄만 남긴다. 그림 파일을 건드리지 않는다.
    action: z.literal('keep-line'),
    projectId: z.string().uuid(),
    shotId: z.string().min(1),
    line: z.object({ text: z.string().trim().min(1).max(600), lang: z.enum(['ko', 'en']) }),
    // 화면이 본 연출 장 주소(읽은 줄의 주소) — 지금 연출 장과 다르면 옛 화살표에 대한 줄이라 409. 못 읽은 샷은 안 보낸다.
    direction: z.string().max(4000).optional(),
  }),
])

export async function POST(req: Request) {
  let capacityContext: { projectId: string; kind: string; userId: string } | null = null
  // 오류 말은 지금 화면 말로(검토 rev-realarrow 5 · 2차 낮음 1) — 화면이 보낸 말 → 계정에 저장된 말 → en. 예전엔 늘 한국어였다.
  //   모든 호출이 이 말을 받는다(끝 장 · 고친 줄 두 호출도 — 오너 2026-11-27 P3, 그 안의 일반 오류까지 사용자 말). 알려진 오류는 아래에서 이 말로 한 번 더 만든다(lib 안 다른 길이 기본 말로 만든 것까지).
  let locale: AppLocale = 'en'
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    locale = requestUiLocale(req.headers.get(UI_LOCALE_HEADER), (user as { user_metadata?: { locale?: unknown } }).user_metadata?.locale)
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const body = parsed.data
    if (!(await userOwnsProject(body.projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    capacityContext = { projectId: body.projectId, kind: 'image_generation', userId: user.id }

    // 덮어쓸 그림은 늘 이 프로젝트 폴더 안이어야 한다 — 주소가 브라우저가 고칠 수 있는 rough_storyboard 에서 온다(2026-11-01 리뷰 M5).
    if (body.action === 'separate') {
      const data = await separateArrowLayer(body.projectId, body.shotId, locale, { projectFolderOnly: true, expectDirection: body.direction })
      return NextResponse.json({ data })
    }
    if (body.action === 'read-direction') {
      const read = await readDirection(body.projectId, body.shotId)
      return NextResponse.json({ data: { read } })
    }
    if (body.action === 'keep-line') {
      const read = await keepEditedDirectionLine(body.projectId, body.shotId, body.line, locale, { expectDirection: body.direction })
      return NextResponse.json({ data: { read } })
    }
    if (body.action === 'regenerate-end' || (body.action === 'regenerate-frame' && body.frame === 'end')) {
      const line = body.action === 'regenerate-frame' ? (body.line ?? null) : null
      const data = await regenerateEndFrame(body.projectId, body.shotId, locale, { line, userId: user.id, projectFolderOnly: true })
      return NextResponse.json({ data })
    }
    if (body.action === 'regenerate-frame') {
      const frame = body.frame === 'direction' ? 'direction' : 'start'
      const data = await regenerateRoughFrame(body.projectId, body.shotId, frame, locale, { projectFolderOnly: true })
      return NextResponse.json({ data })
    }
    const data = await saveDirectingFrame(body.projectId, body.shotId, body.image, locale, { projectFolderOnly: true })
    return NextResponse.json({ data })
  } catch (e) {
    // 알려진 오류는 사용자의 화면 말로 다시 만든다(lib 이 기본 말로 만든 것이어도).
    if (e instanceof ForeignMediaPathError) return NextResponse.json({ error: new ForeignMediaPathError(locale).message }, { status: 403 })
    if (e instanceof StaleDirectionError) return NextResponse.json({ error: new StaleDirectionError(locale).message, code: 'stale_direction' }, { status: 409 })
    if (e instanceof DirectionUnreadableError) return NextResponse.json({ error: new DirectionUnreadableError(locale).message, code: 'direction_unreadable' }, { status: 422 })
    if (e instanceof DirectionTranslateError) return NextResponse.json({ error: new DirectionTranslateError(locale).message, code: 'direction_translate_failed' }, { status: 422 })
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
