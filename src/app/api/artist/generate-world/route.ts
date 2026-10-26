// 월드 샷(wide/establishing) 비동기 생성 — fal T2I submit + generation_jobs.
//
// 캐릭터 뷰(generate-sheet)와 동일 패턴: submit만 하고 jobId 반환 → 완료는 webhook(/poll reconcile)이
// storage 업로드 + locations[column] 갱신. 프롬프트는 호출자(artist-store)가 빌드해 전달한다.
// fal 전용 — gemini/tailscale provider는 webhook 미지원이라 호출자가 기존 동기 경로를 쓴다.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import {
  countFailedJobsForTarget,
  hasQueuedWorldShotJob,
  listFailedWorldShotJobs,
  AUTO_GENERATION_GIVE_UP_THRESHOLD,
  type GenerationJobActor,
} from '@/lib/generation-jobs'
import { isImageModelKey, type ImageModelKey } from '@/lib/image-models'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { applyWorldSafeMode, ensureNoPeopleClause } from '@/lib/artist/world-prompt'
import { checkGenerationCapacity } from '@/lib/generation-quota'
import { capacityReservationRejection, quotaRejectionResponse } from '@/lib/api/quota'
import { assertUserTextAllowed } from '@/lib/moderation/creem'
import { moderationRejectionResponse } from '@/lib/api/moderation'
import { resolveStyleAnchor } from '@/lib/style-anchor'
import { styleDrawsWithoutReference } from '@/lib/style-facets/reference-image'
import { styleAnalysisPending } from '@/lib/style-facets/analysis-wait'
import { submitWorldShotJob } from '@/lib/artist/world-submit'
import { parseSeries, styleIdOf } from '@/lib/series/snapshot'
import {
  seriesLocationReference,
  seriesStyleSample,
  withSeriesLocationReference,
  withSeriesLocationStyleSample,
} from '@/lib/series/redraw-reference'
import { isChatTraceId } from '@/lib/chat-trace'
import { chatTraceBelongsToProject } from '@/lib/chat-trace-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const VALID_COLUMNS = new Set(['wide_shot'])

/** 이 화 기본 모습의 와이드샷 — 없으면 ''. 시리즈 참고 그림이 필요한지(이 화 그림이 비어 있는지) 볼 때만 읽는다. */
async function currentWideShot(projectId: string, locationId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('locations')
    .select('wide_shot')
    .eq('project_id', projectId)
    .eq('location_id', locationId)
    .maybeSingle()
  return typeof data?.wide_shot === 'string' ? data.wide_shot : ''
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const {
      projectId, locationId, column, prompt, aspectRatio, actor, sourceHash, traceId,
      model: modelInput, safeMode, descriptionHash, appearanceKey: appearanceKeyInput,
    } =
      (await req.json()) as {
        projectId?: string
        locationId?: string
        column?: string
        prompt?: string
        aspectRatio?: string
        actor?: string
        sourceHash?: string // F2: 호출자가 computeWorldImageSourceHash(prompt)로 계산해 동반 — 라우트는 DB 재조립 안 함.
        traceId?: string
        model?: string // 약속 B5: 이미지 생성 모델(없으면 캐릭터와 같은 기본값)
        safeMode?: boolean // 약속 B9: 콘텐츠 정책 거절 뒤 우회 재시도
        descriptionHash?: string | null // 약속 B7: 설명(EN base) 해시 → 후보 appearance_hash
        appearanceKey?: string | null // 약속 C10: 배경 모습(변형) 키. 없거나 'default' = 기본 모습(locations 행)
      }

    if (!projectId || !locationId || !column || !prompt) {
      return NextResponse.json(
        { error: 'Invalid request: projectId, locationId, column, prompt required' },
        { status: 400 },
      )
    }
    if (traceId !== undefined && !isChatTraceId(traceId)) {
      return NextResponse.json({ error: 'Invalid request: traceId must be a UUID' }, { status: 400 })
    }
    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response
    if (traceId && !(await chatTraceBelongsToProject(projectId, traceId))) {
      return NextResponse.json({ error: 'Invalid request: traceId does not belong to project' }, { status: 409 })
    }

    // 멀티유저 동시성 게이트: 유저 상한 + 전역 fal 슬롯(#global-semaphore). 둘 중 하나라도 차면 429.
    const quota = await checkGenerationCapacity(access.userId!, 'image')
    if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: 'world_shot', userId: access.userId })

    // 클라이언트 진입점 귀속 — 'chat'(글로벌 채팅 updates)만 구분, 그 외는 전부 'ui'.
    const jobActor: GenerationJobActor = actor === 'chat' ? 'chat' : 'ui'
    if (!VALID_COLUMNS.has(column)) {
      return NextResponse.json({ error: `Invalid column: ${column}` }, { status: 400 })
    }
    const model: ImageModelKey | null = isImageModelKey(modelInput) ? modelInput : null
    const appearanceKey = typeof appearanceKeyInput === 'string' && appearanceKeyInput.trim() && appearanceKeyInput !== 'default'
      ? appearanceKeyInput.trim()
      : null

    // 중복 제출 가드(DB-authoritative, 캐릭터 시트 라우트와 대칭): 같은 슬롯에 queued 잡이 있으면 새 제출 생략.
    if (await hasQueuedWorldShotJob(projectId, locationId, column, appearanceKey)) {
      return NextResponse.json({ ok: true, status: 'queued', deduped: true, locationId, column })
    }

    // 빈칸만 채운다(캐릭터 시트 라우트와 대칭, 2026-10-27 디자이너 QA 1차 #05): 자율 생성(actor='auto')은 이 모습의
    //   그림이 이미 있으면 제출하지 않는다. 화면이 아직 모르는 사이 다 그려진 배경을 '안 나온 그림 다시 그리기'가
    //   또 요청하면 같은 배경을 두 번 그리고 두 번 과금됐다. 사람의 다시 만들기(ui/chat)는 그대로 그린다.
    if (actor === 'auto') {
      const { data: drawn, error: drawnError } = appearanceKey
        ? await supabaseAdmin.from('location_appearances').select('wide_shot')
          .eq('project_id', projectId).eq('location_id', locationId).eq('appearance_key', appearanceKey).maybeSingle()
        : await supabaseAdmin.from('locations').select('wide_shot')
          .eq('project_id', projectId).eq('location_id', locationId).maybeSingle()
      if (drawnError) throw drawnError
      const existing = (drawn as { wide_shot?: unknown } | null)?.wide_shot
      if (typeof existing === 'string' && existing) {
        return NextResponse.json({ ok: true, skipped: true, reason: 'exists', locationId, column })
      }
    }

    // safe-mode 자격/상한(약속 B9): 슬롯의 최근 실패가 moderation 류일 때만 순화 변환을 적용하고,
    //   사람이 누른 우회 재시도는 SAFE_RETRY_CAP 으로 비용 상한을 둔다.
    let effectiveSafeMode = false
    if (safeMode === true) {
      const failures = await listFailedWorldShotJobs(projectId)
      const slot = failures.find((f) => f.locationId === locationId && f.column === column)
      if (slot) {
        if ((jobActor === 'ui' || jobActor === 'chat') && slot.safeFailCount >= SAFE_RETRY_CAP) {
          return NextResponse.json({ ok: true, skipped: true, reason: 'capped', safeFailCount: slot.safeFailCount })
        }
        effectiveSafeMode = slot.moderation
      }
    }
    // 약속 B1: 어떤 경로(팝업 편집·채팅·자동 초안)로 왔든 배경 프롬프트에는 사람 금지 절이 붙는다.
    const finalPrompt = ensureNoPeopleClause(effectiveSafeMode ? applyWorldSafeMode(prompt) : prompt)

    // give-up 게이트: 자율 first-fill(actor='auto')은 같은 슬롯 실패가 임계값 이상이면 멈춘다
    //   (무한 재시도·fal 과금 차단). 사람의 명시적 재생성(ui/chat)은 통과 → 회복 경로(architecture §5).
    if (actor === 'auto') {
      const failed = await countFailedJobsForTarget(projectId, 'world_shot', {
        locationId,
        column,
      })
      if (failed >= AUTO_GENERATION_GIVE_UP_THRESHOLD) {
        console.warn(
          `[artist/generate-world] give-up: ${locationId}/${column} 실패 ${failed}회 누적 → 자동 생성 skip`,
        )
        return NextResponse.json({ ok: true, skipped: true, reason: 'gave_up', failed })
      }
    }

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id, style_anchor_key, custom_style_anchor, series')
      .eq('id', projectId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    // 그림체 분석이 도는 동안은 그리지 않는다(2026-10-10 오너) — 분석이 끝나면 서버가 빈칸을 그린다. 화면은 대기 중인 요청처럼 조용히 끝낸다.
    if (styleAnalysisPending(project.custom_style_anchor)) {
      return NextResponse.json({ ok: true, status: 'queued', deduped: true, waitingForStyle: true, locationId, column })
    }
    const anchor = await resolveStyleAnchor(project)
    // 기준 그림 없이 그리는 그림체(실사, 2026-10-13 오너)의 배경은 글자 금지 줄과 16:9 크기로 그린다 — 기준 그림이 있으면 그림체 글이 막던 글자.
    const styleWithoutReference = !anchor && (await styleDrawsWithoutReference(project))

    // 약속 C10: 변형(모습)은 존재해야 하고, 기본 모습의 wide_shot 을 연속성 참조로 붙인다(캐릭터의 기본 얼굴 참조와 같다).
    let referenceImageUrls: string[] = []
    /** 이 화 기본 모습 와이드샷 — 읽었을 때만 값이 있다('' = 비어 있음, null = 아직 안 읽음). */
    let baseWideShot: string | null = null
    if (appearanceKey) {
      const [{ data: variant }, { data: base }] = await Promise.all([
        supabaseAdmin
          .from('location_appearances')
          .select('appearance_key')
          .eq('project_id', projectId)
          .eq('location_id', locationId)
          .eq('appearance_key', appearanceKey)
          .maybeSingle(),
        supabaseAdmin.from('locations').select('wide_shot').eq('project_id', projectId).eq('location_id', locationId).maybeSingle(),
      ])
      if (!variant) return NextResponse.json({ error: 'Appearance not found' }, { status: 404 })
      baseWideShot = typeof base?.wide_shot === 'string' ? base.wide_shot : ''
      if (baseWideShot) referenceImageUrls = [baseWideShot]
    }
    // 시리즈 다음 화(2026-10-26): 이어받았는데 이 화 와이드샷이 아직 비어 있는 배경만 앞 화 와이드샷을 참고 그림으로 받는다 —
    //   그림체는 이 화 것이다. 이 화 그림이 이미 있으면 그 그림이 기준이라 앞 화 그림을 싣지 않는다(변형의 기준 그림도 같다).
    //   조회는 이어받은 배경일 때만 — 시리즈가 아닌 프로젝트는 종전과 같은 질의만 돈다.
    const series = parseSeries((project as { series?: unknown }).series)
    const seriesWideShot = seriesLocationReference(series, locationId)
    let submitPrompt = finalPrompt
    if (seriesWideShot && !(baseWideShot ?? (await currentWideShot(projectId, locationId)))) {
      referenceImageUrls = [...referenceImageUrls, seriesWideShot]
      submitPrompt = withSeriesLocationReference(finalPrompt)
    }
    // 같은 그림체로 새로 나온 배경(2026-10-27): 앞 화 다른 배경 한 장을 그림체 견본으로 붙인다(자동 초안과 같은 규칙).
    //   기본 모습은 다시 그릴 때도 이 화 그림을 참고로 싣지 않아 처음과 다시 그리기 모두 견본을 붙인다. 변형은 기본 모습 그림이 기준이다.
    const styleSampleUrl =
      anchor && !appearanceKey && !seriesWideShot ? seriesStyleSample(series, 'location', locationId, styleIdOf(project)) : null
    if (styleSampleUrl) submitPrompt = withSeriesLocationStyleSample(finalPrompt)

    // #creem-moderation(2026-10-11): 자리 예약(world-submit.ts) 전에 사용자가 보낸 설명만 검사한다 —
    //   사람 금지 절(NO_PEOPLE_CLAUSE)·앵커 절은 우리 문구라 보내지 않는다.
    let moderation
    try {
      moderation = await assertUserTextAllowed([prompt], { projectId, kind: 'world_shot', userId: access.userId })
    } catch (e) {
      const rejected = moderationRejectionResponse(e, { projectId, kind: 'world_shot', userId: access.userId })
      if (rejected) return rejected
      throw e
    }

    // 제출은 자리 예약 뒤에만 일어난다(world-submit.ts) — 트리거가 자리 없음으로 거절하면 그 예외를
    //   사전 검사와 같은 429 + 축 관측으로 옮긴다(#generation-capacity-trigger 2026-09-14).
    let job: Awaited<ReturnType<typeof submitWorldShotJob>>
    try {
      job = await submitWorldShotJob({
        projectId,
        locationId,
        column: column as 'wide_shot',
        prompt: submitPrompt,
        aspectRatio: aspectRatio ?? '16:9',
        actor: jobActor,
        userId: access.userId!,
        workspaceId: project.workspace_id,
        sourceHash: sourceHash ?? null,
        anchor,
        styleWithoutReference,
        chatTraceId: traceId ?? null,
        model,
        safeMode: effectiveSafeMode,
        descriptionHash: typeof descriptionHash === 'string' ? descriptionHash : null,
        appearanceKey,
        referenceImageUrls,
        styleSampleUrl,
        moderation,
      })
    } catch (e) {
      const rejected = capacityReservationRejection(e, { projectId, kind: 'world_shot', userId: access.userId })
      if (rejected) return rejected
      throw e
    }

    return NextResponse.json({ ok: true, jobId: job.id, status: 'queued' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/generate-world]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
