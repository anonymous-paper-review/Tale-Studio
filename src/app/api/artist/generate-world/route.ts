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
import { quotaRejectionResponse } from '@/lib/api/quota'
import { resolveStyleAnchor } from '@/lib/style-anchor'
import { submitWorldShotJob } from '@/lib/artist/world-submit'
import { isChatTraceId } from '@/lib/chat-trace'
import { chatTraceBelongsToProject } from '@/lib/chat-trace-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const VALID_COLUMNS = new Set(['wide_shot'])

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
      .select('workspace_id, style_anchor_key, custom_style_anchor')
      .eq('id', projectId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const anchor = await resolveStyleAnchor(project)

    // 약속 C10: 변형(모습)은 존재해야 하고, 기본 모습의 wide_shot 을 연속성 참조로 붙인다(캐릭터의 기본 얼굴 참조와 같다).
    let referenceImageUrls: string[] = []
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
      const baseUrl = typeof base?.wide_shot === 'string' ? base.wide_shot : ''
      if (baseUrl) referenceImageUrls = [baseUrl]
    }

    const job = await submitWorldShotJob({
      projectId,
      locationId,
      column: column as 'wide_shot',
      prompt: finalPrompt,
      aspectRatio: aspectRatio ?? '16:9',
      actor: jobActor,
      userId: access.userId!,
      workspaceId: project.workspace_id,
      sourceHash: sourceHash ?? null,
      anchor,
      chatTraceId: traceId ?? null,
      model,
      safeMode: effectiveSafeMode,
      descriptionHash: typeof descriptionHash === 'string' ? descriptionHash : null,
      appearanceKey,
      referenceImageUrls,
    })

    return NextResponse.json({ ok: true, jobId: job.id, status: 'queued' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/generate-world]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
