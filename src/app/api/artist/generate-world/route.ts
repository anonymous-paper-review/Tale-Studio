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
  AUTO_GENERATION_GIVE_UP_THRESHOLD,
  type GenerationJobActor,
} from '@/lib/generation-jobs'
import { checkGenerationCapacity } from '@/lib/generation-quota'
import { quotaRejectionResponse } from '@/lib/api/quota'
import { resolveStyleAnchor } from '@/lib/style-anchor'
import { submitWorldShotJob } from '@/lib/artist/world-submit'

export const runtime = 'nodejs'
export const maxDuration = 60

const VALID_COLUMNS = new Set(['wide_shot'])

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const { projectId, locationId, column, prompt, aspectRatio, actor, sourceHash } =
      (await req.json()) as {
        projectId?: string
        locationId?: string
        column?: string
        prompt?: string
        aspectRatio?: string
        actor?: string
        sourceHash?: string // F2: 호출자가 computeWorldImageSourceHash(prompt)로 계산해 동반 — 라우트는 DB 재조립 안 함.
      }

    if (!projectId || !locationId || !column || !prompt) {
      return NextResponse.json(
        { error: 'projectId, locationId, column, prompt required' },
        { status: 400 },
      )
    }
    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    // 멀티유저 동시성 게이트: 유저 상한 + 전역 fal 슬롯(#global-semaphore). 둘 중 하나라도 차면 429.
    const quota = await checkGenerationCapacity(access.userId!, 'image')
    if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: 'world_shot', userId: access.userId })

    // 클라이언트 진입점 귀속 — 'chat'(글로벌 채팅 updates)만 구분, 그 외는 전부 'ui'.
    const jobActor: GenerationJobActor = actor === 'chat' ? 'chat' : 'ui'
    if (!VALID_COLUMNS.has(column)) {
      return NextResponse.json({ error: `invalid column: ${column}` }, { status: 400 })
    }

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
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    const anchor = await resolveStyleAnchor(project)

    const job = await submitWorldShotJob({
      projectId,
      locationId,
      column: column as 'wide_shot',
      prompt,
      aspectRatio: aspectRatio ?? '16:9',
      actor: jobActor,
      userId: access.userId!,
      workspaceId: project.workspace_id,
      sourceHash: sourceHash ?? null,
      anchor,
    })

    return NextResponse.json({ ok: true, jobId: job.id, status: 'queued' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/generate-world]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
