// 샷 스토리보드 이미지(I2I) 비동기 생성 — fal submit + generation_jobs.
//
// 캐릭터 뷰/월드 샷과 동일 패턴: submit만 하고 jobId 반환 → 완료는 webhook(/poll reconcile)이
// storage 업로드 + shots.storyboard_image(JSONB) 갱신. 프롬프트/레퍼런스는 호출자(director-store)가 전달.
// writerShotId(=shots.shot_id) 필수 — DB 영속 키. 수동 노드(shot_id 없음)는 호출자가 기존 동기 경로 사용.
//
// 스트립 모드(#real-strip 2026-07-22): 샷에 러프 3프레임이 있으면 자동 승격 — 서버가 러프 3프레임을
//   스트립 템플릿에 합성해 1번 레퍼런스로 주고, 같은 3패널을 최종 화풍으로 리페인트시킨다.
//   완료 시 finalize 가 strip1 크롭으로 storyboard_image.frames{start,direction,end} 를 채운다.
//   러프 프레임이 없는 샷/구버전은 기존 단일 이미지 경로 그대로.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { createGenerationJob } from '@/lib/generation-jobs'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { applyStyleAnchor, resolveStyleAnchorByKey, type AnchorableSubmit } from '@/lib/style-anchor'
import { buildBestEffortFalRequestCapturePatch } from '@/lib/fal/observability'
import { appendCheckConstraints } from '@/lib/writer/check-notes'
import { composeRoughReferenceStrip, buildRealStripPrompt } from '@/lib/director/storyboard-strip'
import { storageKeySegment } from '@/lib/storage/key-segment'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 멀티유저 쿼터 (Phase 3): 유저 in-flight 작업이 상한이면 429.
    const quota = await checkUserQuota(user.id)
    if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })

    const { projectId, writerShotId, prompt, referenceImageUrls, aspectRatio } =
      (await req.json()) as {
        projectId?: string
        writerShotId?: string
        prompt?: string
        referenceImageUrls?: string[]
        aspectRatio?: string
      }

    if (!projectId || !writerShotId || !prompt) {
      return NextResponse.json(
        { error: 'projectId, writerShotId, prompt required' },
        { status: 400 },
      )
    }

    const [{ data: project }, { data: shot }] = await Promise.all([
      supabaseAdmin
        .from('projects')
        .select('workspace_id, style_anchor_key')
        .eq('id', projectId)
        .maybeSingle(),
      supabaseAdmin
        .from('shots')
        .select('shot_id, scene_id, sort_order, rough_storyboard, check_notes')
        .eq('project_id', projectId)
        .eq('shot_id', writerShotId)
        .maybeSingle(),
    ])
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    const anchor = await resolveStyleAnchorByKey(project.style_anchor_key)

    const callerRefs = referenceImageUrls?.length ? referenceImageUrls : undefined

    // 스트립 모드 판별 — 러프 3프레임 완비 시에만 (하나라도 없으면 기존 단일 경로).
    const roughFrames = (
      shot?.rough_storyboard as {
        frames?: { start?: string; direction?: string; end?: string }
      } | null
    )?.frames
    const stripFrames =
      roughFrames?.start && roughFrames.direction && roughFrames.end
        ? { start: roughFrames.start, direction: roughFrames.direction, end: roughFrames.end }
        : null

    // #n-1(2026-08-05): 같은 씬 직전 샷의 종료 상태를 서버측 첨부 — 샷별 독립 잡이던 실사의
    //   연속성 봉합. DB pull 이라 잡 간 의존이 생기지 않는다 (architecture §0: 둘 다 진실을 읽는다).
    let continuityLine = ''
    const shotMeta = shot as { scene_id?: string; sort_order?: number } | null
    if (typeof shotMeta?.sort_order === 'number' && shotMeta.sort_order > 0) {
      const { data: prev } = await supabaseAdmin
        .from('shots')
        .select('scene_id, prompt, action_description')
        .eq('project_id', projectId)
        .eq('sort_order', shotMeta.sort_order - 1)
        .maybeSingle()
      const prevText = (((prev?.prompt as string) || (prev?.action_description as string)) ?? '').trim()
      if (prev?.scene_id === shotMeta.scene_id && prevText) {
        continuityLine = `\nContinuity: moments earlier the previous shot showed "${prevText.slice(0, 110)}". Carry over the character's wardrobe, props, lighting and surrounding environment from it, while depicting this shot's own moment.`
      }
    }

    // shotCheck 채널1(#p2-wiring): 검증이 남긴 연속성 제약을 서버에서 최종 첨부 —
    //   클라가 어떤 프롬프트를 보내든(derivedPrompt/promptOverride) 시각적 사실은 지켜지게.
    const guardedPrompt =
      appendCheckConstraints(prompt, (shot as { check_notes?: unknown } | null)?.check_notes) +
      continuityLine

    let finalOpts: AnchorableSubmit
    let stripRefUrl: string | null = null
    let sceneLighting: string | null = null
    if (stripFrames) {
      // #F-006: 씬 시간대를 스트립 리페인트에 배선 — 샷 산문의 시간대 단어는 확률적이라(실측
      //   1e166e55 sc_04: 7샷 중 4샷에만 존재) scenes.time_of_day 진실로 고정한다.
      if (shotMeta?.scene_id) {
        const { data: scene } = await supabaseAdmin
          .from('scenes')
          .select('time_of_day')
          .eq('project_id', projectId)
          .eq('scene_id', shotMeta.scene_id)
          .maybeSingle()
        sceneLighting = (((scene?.time_of_day as string) ?? '').trim() || null)
      }
      // 합성 스트립 업로드 — 결정적 경로 upsert (재생성마다 교체, 잔재 누적 없음).
      const stripBuf = await composeRoughReferenceStrip(stripFrames)
      const refPath = `${project.workspace_id}/${projectId}/shots/${storageKeySegment(writerShotId)}_storyboard_ref_strip.png`
      const { error: upErr } = await supabaseAdmin.storage
        .from('media')
        .upload(refPath, stripBuf, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      stripRefUrl = `${supabaseAdmin.storage.from('media').getPublicUrl(refPath).data.publicUrl}?v=${Date.now()}`

      // 레퍼런스 계약(buildRealStripPrompt 와 합치): [스트립, ...캐릭터/월드, 앵커?].
      //   applyStyleAnchor 는 앵커를 1번에 놓아 스트립 프롬프트와 충돌 → 스트립 모드는 수동 조립.
      finalOpts = {
        prompt: buildRealStripPrompt(guardedPrompt, {
          characterRefCount: callerRefs?.length ?? 0,
          hasStyleRef: !!anchor,
          sceneLighting,
        }),
        // #real-strip-guard(2026-08-06): 'auto' 위임이 가로 단일컷 반환을 허용했다(실측 011fd4bd —
        //   액자 테두리 단일컷을 고정 크롭이 액자째 3분할). 세로 캔버스를 강제해 시트 계약 준수를 유도.
        image_size: '1024x1536',
        reference_image_urls: [
          stripRefUrl,
          ...(callerRefs ?? []),
          ...(anchor ? [anchor.imageUrl] : []),
        ],
      }
    } else {
      const baseOpts: AnchorableSubmit = {
        prompt: guardedPrompt,
        aspect_ratio: aspectRatio ?? '16:9',
        ...(callerRefs ? { reference_image_urls: callerRefs } : {}),
      }
      const mode = callerRefs ? 'multiref' : 'single'
      finalOpts = anchor ? applyStyleAnchor(anchor, baseOpts, mode) : baseOpts
    }

    const { request_id, model, fal_request } = await falImageSubmit({
      ...finalOpts,
      webhookUrl: resolveWebhookUrl(),
    })
    const falCapture = buildBestEffortFalRequestCapturePatch(fal_request, model)

    const job = await createGenerationJob({
      projectId,
      requestId: request_id,
      model,
      kind: 'shot_storyboard',
      userId: user.id,
      workspaceId: project.workspace_id,
      provider: 'fal',
      inputSnapshot: {
        prompt: finalOpts.prompt,
        aspect_ratio: finalOpts.aspect_ratio,
        reference_image_urls: finalOpts.reference_image_urls,
        ...(finalOpts.model ? { model: finalOpts.model } : {}),
        style_anchor_key: anchor?.key ?? null,
        scene_time_of_day: sceneLighting,
        ...(stripRefUrl ? { strip_ref_url: stripRefUrl } : {}),
        ...falCapture,
      },
      target: {
        workspaceId: project.workspace_id,
        writerShotId,
        ...(stripFrames ? { gridVariant: 'strip1' as const } : {}),
      },
    })

    return NextResponse.json({ ok: true, jobId: job.id, status: 'queued', mode: stripFrames ? 'strip3' : 'single' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[director/generate-storyboard]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
