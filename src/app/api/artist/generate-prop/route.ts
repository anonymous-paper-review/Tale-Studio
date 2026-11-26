// POST /api/artist/generate-prop — 소품 그림 한 장 그리기(D7, 오너 2026-11-22 "소품도 한 장"). fal 제출 + generation_jobs(prop_image).
//   배경 그리기 창구(generate-world)와 같은 순서 · 같은 규칙: 겹친 요청 막기 → (저절로면) 빈칸만 · 실패 상한 → 순화 재시도 상한 →
//   동시 자리 → 그림체 분석 대기 → 사용자 글 검사 → 자리 예약 · 제출. 완료는 웹훅(/확인)이 props.image_url 에 적는다(fal/finalize).
//   지시문은 서버가 DB 로 짓는다(소품 행의 이름 · 생김새 + 작품 그림체) — 화면 · 채팅 · [만들기] 가 같은 그림을 받는다.
//   Take 를 쓰지 않는다(그림은 무과금 — take-cost.ts). 약속: tests/artist/prop-image-route.test.ts · tests/artist/prop-image.test.ts
import { NextResponse } from 'next/server'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { countFailedJobsForTarget, AUTO_GENERATION_GIVE_UP_THRESHOLD, type GenerationJobActor } from '@/lib/generation-jobs'
import { checkGenerationCapacity } from '@/lib/generation-quota'
import { capacityReservationRejection, quotaRejectionResponse } from '@/lib/api/quota'
import { assertUserTextAllowed, ModerationBlockedError } from '@/lib/moderation/creem'
import { moderationRejectionResponse } from '@/lib/api/moderation'
import { resolveStyleAnchor } from '@/lib/style-anchor'
import { styleDrawsWithoutReference } from '@/lib/style-facets/reference-image'
import { resolvePhotoLook } from '@/lib/style-facets/photo-look'
import { styleAnalysisPending } from '@/lib/style-facets/analysis-wait'
import { isImageModelKey } from '@/lib/image-models'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { isChatTraceId } from '@/lib/chat-trace'
import { chatTraceBelongsToProject } from '@/lib/chat-trace-server'
import { styleIdOf } from '@/lib/series/snapshot'
import { propImageStamp } from '@/lib/artist/prop-image'
import { planPropImageSubmit } from '@/lib/artist/prop-image-plan'
import { PROP_SHEET_FILE } from '@/lib/artist/prop-sheet-template'
import { templateAssetUrl } from '@/lib/storage/template-asset'
import { hasQueuedPropImageJob, listFailedPropImageJobs, loadPropDrawingContext, submitPropImageJob } from '@/lib/artist/prop-jobs'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: unknown
      propId?: unknown
      actor?: unknown
      model?: unknown
      instruction?: unknown
      safeMode?: unknown
      traceId?: unknown
    }
    const projectId = typeof body.projectId === 'string' ? body.projectId : ''
    const propId = typeof body.propId === 'string' ? body.propId.trim() : ''
    if (!projectId || !propId) {
      return NextResponse.json({ error: 'Invalid request: projectId, propId required' }, { status: 400 })
    }
    const traceId = typeof body.traceId === 'string' ? body.traceId : undefined
    if (body.traceId !== undefined && !isChatTraceId(body.traceId)) {
      return NextResponse.json({ error: 'Invalid request: traceId must be a UUID' }, { status: 400 })
    }
    const instruction = typeof body.instruction === 'string' && body.instruction.trim() ? body.instruction.trim().slice(0, 500) : null
    const model = isImageModelKey(body.model) ? body.model : null
    const auto = body.actor === 'auto'
    // 작업 기록의 주체 — 채팅(updates)만 가르고 그 밖(화면 · 저절로)은 ui. 저절로 그리기는 빈칸 채우기 규칙(auto)으로만 다르다.
    const jobActor: GenerationJobActor = body.actor === 'chat' ? 'chat' : 'ui'

    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response
    if (traceId && !(await chatTraceBelongsToProject(projectId, traceId))) {
      return NextResponse.json({ error: 'Invalid request: traceId does not belong to project' }, { status: 409 })
    }

    const { prop, project, personClash } = await loadPropDrawingContext(projectId, propId)
    if (!prop || !project) return NextResponse.json({ error: 'Prop not found' }, { status: 404 })
    if (personClash) return NextResponse.json({ error: 'Ambiguous character entity' }, { status: 409 })

    // 겹친 요청 — 같은 소품을 그리는 중이면 그 작업을 기다린다.
    if (await hasQueuedPropImageJob(projectId, propId)) {
      return NextResponse.json({ ok: true, status: 'queued', deduped: true, propId })
    }
    // 저절로 그리기는 빈칸만 채운다 — 화면이 모르는 사이 다 그려진 소품을 또 그리지 않는다.
    if (auto && prop.image_url) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'exists', propId })
    }
    // 순화 재시도(약속 B9 과 같다) — 최근 실패가 정책 거절일 때만 순화 문구를 붙이고, 사람이 누른 우회는 상한을 둔다.
    let safeMode = false
    if (body.safeMode === true) {
      const slot = (await listFailedPropImageJobs(projectId)).find((failure) => failure.propId === propId)
      if (slot) {
        if (!auto && slot.safeFailCount >= SAFE_RETRY_CAP) {
          return NextResponse.json({ ok: true, skipped: true, reason: 'capped', safeFailCount: slot.safeFailCount })
        }
        safeMode = slot.moderation
      }
    }
    // 저절로 그리기는 같은 소품 실패가 상한(배경과 같은 수)에 닿으면 멈춘다 — 끝없는 재시도 · 비용 차단. 사람의 다시 그리기는 통과.
    if (auto) {
      const failed = await countFailedJobsForTarget(projectId, 'prop_image', { propId })
      if (failed >= AUTO_GENERATION_GIVE_UP_THRESHOLD) {
        return NextResponse.json({ ok: true, skipped: true, reason: 'gave_up', failed })
      }
    }

    const quota = await checkGenerationCapacity(access.userId!, 'image')
    if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: 'prop_image', userId: access.userId })

    // 그림체 분석이 도는 동안은 그리지 않는다(2026-10-10 오너) — 화면은 대기 중인 요청처럼 조용히 끝낸다.
    if (styleAnalysisPending(project.custom_style_anchor)) {
      return NextResponse.json({ ok: true, status: 'queued', deduped: true, waitingForStyle: true, propId })
    }
    const anchor = await resolveStyleAnchor(project as Parameters<typeof resolveStyleAnchor>[0])
    const styleWithoutReference = !anchor && (await styleDrawsWithoutReference(project as Parameters<typeof styleDrawsWithoutReference>[0]))
    const appearance = prop.appearance ?? ''
    // 소품 양식(m1126 A2) — 인물 시트 양식처럼 스토리지에 올린 주소를 첫 참고 그림으로(template-asset.ts). 못 올리면 양식 없이 그린다.
    const templateUrl = await templateAssetUrl(PROP_SHEET_FILE)
    // 실사 그림체(기준 그림 없는 실사)만 사진 글(리드 R2) — 인물 시트 · 배경과 같은 길. 그림체 기준 그림이 있으면 묻지 않는다.
    const photoLook = anchor ? null : await resolvePhotoLook(project as Parameters<typeof resolvePhotoLook>[0])
    const plan = planPropImageSubmit({ name: prop.name, appearance, instruction, safeMode, anchor, styleWithoutReference, model, templateUrl, photoLook })

    // 사용자가 쓴 칸(이름 · 생김새 · 바꿀 점)만 검사한다 — 우리 고정 문구 · 그림체 절은 보내지 않는다.
    let moderation
    try {
      moderation = await assertUserTextAllowed([prop.name, appearance, instruction], { projectId, kind: 'prop_image', userId: access.userId })
    } catch (e) {
      // 걸린 소품의 이름을 싣는다(main 2026-11-25 인물 · 배경과 같다) — 거절은 작업 기록이 없어 화면이 이 이름으로만 어느 소품인지 안다.
      const rejected = moderationRejectionResponse(e, {
        projectId,
        kind: 'prop_image',
        userId: access.userId,
        ...(e instanceof ModerationBlockedError ? { target: { kind: 'prop' as const, name: prop.name } } : {}),
      })
      if (rejected) return rejected
      throw e
    }

    let job
    try {
      job = await submitPropImageJob({
        projectId,
        propId,
        plan,
        stamp: propImageStamp(appearance, styleIdOf(project as { style_anchor_key?: string | null; custom_style_anchor?: unknown })),
        actor: jobActor,
        userId: access.userId ?? null,
        workspaceId: project.workspace_id,
        styleAnchorKey: anchor?.key ?? null,
        safeMode,
        chatTraceId: traceId ?? null,
        moderation,
      })
    } catch (e) {
      const rejected = capacityReservationRejection(e, { projectId, kind: 'prop_image', userId: access.userId })
      if (rejected) return rejected
      throw e
    }
    return NextResponse.json({ ok: true, jobId: job.id, status: 'queued' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/generate-prop]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
