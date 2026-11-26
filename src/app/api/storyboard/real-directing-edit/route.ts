// POST /api/storyboard/real-directing-edit — 실사 가운데(연출) 장 화살표 고치기(오너 2026-11-27 N4b). 콘티 길(/api/writer/rough-directing-edit)과 같은 동작 이름.
//   separate: 지금 실사 가운데 장에서 화살표 · 글씨만 지운 밑층(Grok, 같은 가운데 장이면 다시 쓰기)
//   save: 편집기가 평탄화한 가운데 장 → 새 판(arrows-…)이 지금 그림(리드 D1 A)
//   read-direction: 지금 실사 가운데 장을 읽은 한 줄(없으면 읽는 AI 실사판으로 읽어 남김)
//   regenerate-frame(end): 실사 끝 장 작업을 내고 작업 번호를 돌려준다(시작 · 가운데 장 다시 그리기는 받지 않는다)
//   keep-line: 물음 창 [그대로] + 고친 줄 — 끝 장은 그리지 않고 고친 줄만 남긴다
// 얇은 라우트 — 인증 · 검증만 하고 lib(storyboard/real-directing-edit)에 맡긴다. 약속: tests/writer/real-arrow-server.test.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { userOwnsProject } from '@/lib/generation-jobs'
import { capacityReservationRejection } from '@/lib/api/quota'
import { moderationRejectionResponse } from '@/lib/api/moderation'
import { DirectionTranslateError, DirectionUnreadableError, ForeignMediaPathError, StaleDirectionError } from '@/lib/writer/directing-edit'
import { translate } from '@/lib/i18n'
import { parseAppLocale, type AppLocale } from '@/lib/locale'
import {
  RealFramesMissingError,
  RealNotArrowVersionError,
  RealShotBusyError,
  keepRealDirectionLine,
  readRealDirection,
  redrawRealEndFrame,
  saveRealDirectingFrame,
  separateRealArrowLayer,
} from '@/lib/storyboard/real-directing-edit'

export const runtime = 'nodejs'
export const maxDuration = 120 // Grok 밑층(수십 초) · 읽기 + 작업 내기 대기

const Line = z.object({ text: z.string().trim().min(1).max(600), lang: z.enum(['ko', 'en']) })
const Base = { projectId: z.string().uuid(), shotId: z.string().min(1) }
const BodySchema = z.discriminatedUnion('action', [
  // 화면이 보고 있는 가운데 장 주소 — 지금 가운데 장과 다르면 그림 값을 쓰기 전에 409.
  z.object({ action: z.literal('separate'), ...Base, direction: z.string().max(4000).optional() }),
  // PNG data URL — base64 오버헤드 포함 상한(디코드 후 15MB 는 lib 이 다시 본다). direction = 고친 가운데 장(다른 판이면 409).
  z.object({ action: z.literal('save'), ...Base, image: z.string().max(21_000_000), direction: z.string().max(4000).optional() }),
  z.object({ action: z.literal('read-direction'), ...Base }),
  z.object({ action: z.literal('regenerate-frame'), ...Base, frame: z.literal('end'), line: Line.nullish() }),
  z.object({ action: z.literal('keep-line'), ...Base, line: Line, direction: z.string().max(4000).optional() }),
])

export async function POST(req: Request) {
  const blocked = demoWriteBlock(req)
  if (blocked) return blocked
  let context: { projectId: string; kind: 'image_generation' | 'shot_storyboard'; userId: string } | null = null
  // 오류 말은 그 사용자의 화면 말로(검토 rev-realarrow 5 — 진실은 user_metadata.locale, 없으면 en).
  let locale: AppLocale = 'en'
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    locale = parseAppLocale((user as { user_metadata?: { locale?: unknown } }).user_metadata?.locale) ?? 'en'
    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const body = parsed.data
    if (!(await userOwnsProject(body.projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    context = { projectId: body.projectId, kind: body.action === 'regenerate-frame' ? 'shot_storyboard' : 'image_generation', userId: user.id }

    if (body.action === 'separate') {
      const data = await separateRealArrowLayer(body.projectId, body.shotId, locale, { expectDirection: body.direction, userId: user.id })
      return NextResponse.json({ data })
    }
    if (body.action === 'save') {
      const data = await saveRealDirectingFrame(body.projectId, body.shotId, body.image, locale, { expectDirection: body.direction })
      return NextResponse.json({ data })
    }
    if (body.action === 'read-direction') {
      const read = await readRealDirection(body.projectId, body.shotId, locale)
      return NextResponse.json({ data: { read } })
    }
    if (body.action === 'keep-line') {
      const read = await keepRealDirectionLine(body.projectId, body.shotId, body.line, locale, { expectDirection: body.direction })
      return NextResponse.json({ data: { read } })
    }
    const data = await redrawRealEndFrame(body.projectId, body.shotId, locale, { line: body.line ?? null, userId: user.id })
    return NextResponse.json({ data })
  } catch (e) {
    if (e instanceof ForeignMediaPathError) return NextResponse.json({ error: e.message }, { status: 403 })
    if (e instanceof StaleDirectionError) return NextResponse.json({ error: e.message, code: 'stale_direction' }, { status: 409 })
    if (e instanceof RealShotBusyError) return NextResponse.json({ error: e.message, code: 'busy' }, { status: 409 })
    if (e instanceof RealFramesMissingError) return NextResponse.json({ error: e.message, code: 'no_real_frames' }, { status: 409 })
    if (e instanceof RealNotArrowVersionError) return NextResponse.json({ error: e.message, code: 'not_arrow_version' }, { status: 409 })
    // 실사 상세에는 콘티의 "연출 탭"이 없다 — 못 읽음은 실사 말로(검토 rev-realarrow 8).
    if (e instanceof DirectionUnreadableError) {
      return NextResponse.json({ error: translate(locale, 'The AI could not read the arrows, so the end frame was not redrawn. Press Edit and redraw the end frame and write the motion.'), code: 'direction_unreadable' }, { status: 422 })
    }
    if (e instanceof DirectionTranslateError) return NextResponse.json({ error: e.message, code: 'direction_translate_failed' }, { status: 422 })
    // 내용 규칙 거절 · 자리 부족은 표준 상황코드로(콘티 길과 같다).
    const moderated = context && moderationRejectionResponse(e, context)
    if (moderated) return moderated
    const rejected = context && capacityReservationRejection(e, context)
    if (rejected) return rejected
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[storyboard/real-directing-edit]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
