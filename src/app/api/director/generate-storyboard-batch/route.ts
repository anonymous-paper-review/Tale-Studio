// 실사 4샷 일괄 생성(#real-grid 2026-08-06) — 러프 보드의 그리드 방식 이식(이원화의 일괄 축).
//   같은 씬 + 같은 캐릭터 레퍼런스 세트의 러프 완비 샷을 4개씩 묶어 grid4 시트 1콜 리페인트,
//   finalize(storyboard_real_grid)가 크롭 분배. 빈칸 채우기 전용(storyboard 미생성 샷만 —
//   architecture §5: 차 있는 것 교체는 사람의 개별 재생성=단일 스트립). 검증: 실험 시트 통과(011fd4bd).
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { createGenerationJob } from '@/lib/generation-jobs'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { resolveStyleAnchorByKey } from '@/lib/style-anchor'
import { composeRoughReferenceGrid, buildRealGridPrompt } from '@/lib/director/storyboard-strip'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_GRID_JOBS_PER_CALL = 2 // 러프 보드와 동일 관행 — 잔여는 응답 remaining 으로 반복 호출

interface EligibleShot {
  shot_id: string
  scene_id: string
  characters: string[]
  frames: { start: string; direction: string; end: string }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { projectId } = (await req.json()) as { projectId?: string }
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

    const quota = await checkUserQuota(user.id)
    if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id, style_anchor_key')
      .eq('id', projectId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

    const { data: rows } = await supabaseAdmin
      .from('shots')
      .select('shot_id, scene_id, characters, rough_storyboard, storyboard_image')
      .eq('project_id', projectId)
      .order('sort_order')

    const eligible: EligibleShot[] = []
    for (const s of rows ?? []) {
      if (s.storyboard_image) continue // 빈칸만 — 교체는 개별 재생성(단일 스트립) 소관
      const f = (s.rough_storyboard as { frames?: Record<string, string> } | null)?.frames
      if (!f?.start || !f?.direction || !f?.end) continue
      eligible.push({
        shot_id: s.shot_id as string,
        scene_id: s.scene_id as string,
        characters: ((s.characters as string[]) ?? []).slice().sort(),
        frames: { start: f.start, direction: f.direction, end: f.end },
      })
    }

    // 그룹핑: 같은 씬(#grid-shift 교훈)만 키 — 캐릭터 세트는 시트 내 혼재 허용(#real-grid-fix):
    //   세트를 키에 넣으면 시트가 잘게 쪼개져 배칭 이득이 반감(실측 8시트/12샷). 레퍼런스는
    //   합집합으로 전달되고 프롬프트가 칸별 대응("corresponding character")을 지시하므로 안전.
    const groups: EligibleShot[][] = []
    for (const s of eligible) {
      const last = groups[groups.length - 1]
      if (!last || last.length >= 4 || last[0].scene_id !== s.scene_id) groups.push([s])
      else last.push(s)
    }
    const planned = groups.slice(0, MAX_GRID_JOBS_PER_CALL)
    const plannedShots = planned.reduce((n, g) => n + g.length, 0)
    if (!planned.length) {
      return NextResponse.json({ ok: true, data: { submitted: [], remaining: 0 } })
    }

    const anchor = await resolveStyleAnchorByKey(project.style_anchor_key as string | null)
    const charIds = [...new Set(planned.flatMap((g) => g.flatMap((s) => s.characters)))]
    const { data: chars } = charIds.length
      ? await supabaseAdmin
          .from('characters')
          .select('character_id, portrait, view_main')
          .eq('project_id', projectId)
          .in('character_id', charIds)
      : { data: [] as Array<Record<string, unknown>> }
    const charRefs = (chars ?? [])
      .map((c) => ((c.view_main as string) ?? (c.portrait as string)) || null)
      .filter((u): u is string => !!u)

    const webhookUrl = resolveWebhookUrl()
    const submitted: Array<{ jobId: string; shotIds: string[] }> = []
    for (const group of planned) {
      const refGrid = await composeRoughReferenceGrid(group.map((s) => s.frames))
      const refPath = `${project.workspace_id}/${projectId}/shots/real_grid_ref_${Date.now()}_${group[0].shot_id}.png`
      const { error: upErr } = await supabaseAdmin.storage
        .from('media')
        .upload(refPath, refGrid, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      const refUrl = supabaseAdmin.storage.from('media').getPublicUrl(refPath).data.publicUrl

      const { request_id, model } = await falImageSubmit({
        model: 'openai/gpt-image-2/edit',
        prompt: buildRealGridPrompt(group.length, {
          characterRefCount: charRefs.length,
          hasStyleRef: !!anchor,
        }),
        reference_image_urls: [refUrl, ...charRefs, ...(anchor ? [anchor.imageUrl] : [])],
        // 가로 시트 강제 — finalize 가드(세로=계약 위반 실패)와 짝. FalImageOptions.image_size
        //   추가로 이 값이 이제 실제로 fal 요청에 실린다(2026-08-12, #real-strip-guard).
        image_size: '1536x1024',
        webhookUrl,
      })

      const job = await createGenerationJob({
        projectId,
        requestId: request_id,
        model,
        kind: 'storyboard_real_grid',
        userId: user.id,
        workspaceId: project.workspace_id as string,
        provider: 'fal',
        inputSnapshot: {
          shotIds: group.map((s) => s.shot_id),
          ref_grid_url: refUrl,
          style_anchor_key: anchor?.key ?? null,
        },
        target: {
          workspaceId: project.workspace_id as string,
          writerShotIds: group.map((s) => s.shot_id),
          gridVariant: 'grid4',
        },
      })
      submitted.push({ jobId: job.id, shotIds: group.map((s) => s.shot_id) })
    }

    return NextResponse.json({
      ok: true,
      data: { submitted, remaining: eligible.length - plannedShots },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[director/generate-storyboard-batch]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
