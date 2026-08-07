// POST /api/writer/rough-adherence — 러프 START ↔ 샷 설명 정합 검사(#adherence P2).
//   생성 완료 후 클라가 호출(자동) — VLM 이 START 프레임이 액션·인원·초점을 그렸는지 판정,
//   결과를 shots.rough_storyboard.adherence 에 병합한다(불일치 = 카드 배지 + 재생성 유도).
//   best-effort: 키 부재/판정 실패는 조용히 skip — 생성 플로우를 절대 막지 않는다.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { isAdminOwnedProject } from '@/lib/admin'
import { userOwnsProject } from '@/lib/generation-jobs'
import { buildStartClaim } from '@/lib/adherence/core'
import { fetchImageB64, judgeStartFrames, type StartJudgeItem } from '@/lib/adherence/vision'

export const runtime = 'nodejs'
export const maxDuration = 60

const BodySchema = z.object({
  projectId: z.string().uuid(),
  /** 지정 시 해당 샷만 — 미지정 시 미검사 완료 러프 전체 */
  shotIds: z.array(z.string()).max(24).optional(),
})

const JUDGE_BATCH = 8 // VLM 호출당 이미지 수 (페이로드·정확도 균형)

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
    const { projectId, shotIds } = parsed.data
    if (!(await userOwnsProject(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // 관리자 소유 프로젝트 한정(사용자 결정 2026-08-07) — 일반 사용자는 조용한 no-op(200).
    if (!(await isAdminOwnedProject(user, projectId))) {
      return NextResponse.json({ checked: 0, mismatches: 0, gated: true })
    }

    let q = supabaseAdmin
      .from('shots')
      .select('shot_id, action_description, characters, static_spec, rough_storyboard')
      .eq('project_id', projectId)
    if (shotIds?.length) q = q.in('shot_id', shotIds)
    const { data: rows, error } = await q
    if (error) throw error

    // 검사 대상: 러프 완료 + (재검사 방지) 같은 generatedAt 으로 이미 검사한 샷 제외
    const targets = (rows ?? []).filter((r) => {
      const rb = r.rough_storyboard as {
        status?: string
        frames?: { start?: string }
        url?: string
        generatedAt?: number
        adherence?: { checkedFor?: number }
      } | null
      if (rb?.status !== 'completed') return false
      if (!(rb.frames?.start || rb.url)) return false
      return rb.adherence?.checkedFor !== rb.generatedAt
    })
    if (!targets.length) return NextResponse.json({ checked: 0, mismatches: 0 })

    // 이미지 다운스케일 b64 준비 (실패 샷은 skip)
    const items: StartJudgeItem[] = []
    const metaById = new Map<string, { generatedAt: number }>()
    for (const r of targets) {
      const rb = r.rough_storyboard as { frames?: { start?: string }; url?: string; generatedAt?: number }
      const url = rb.frames?.start ?? rb.url
      if (!url) continue
      const b64 = await fetchImageB64(url)
      if (!b64) continue
      const spec = r.static_spec as { framing?: { focal_point?: string } } | null
      items.push({
        id: r.shot_id as string,
        imageB64: b64,
        claim: buildStartClaim({
          actionEn: (r.action_description as string) ?? '',
          focalPoint: spec?.framing?.focal_point ?? null,
          figureCount: ((r.characters as string[]) ?? []).length,
        }),
      })
      metaById.set(r.shot_id as string, { generatedAt: rb.generatedAt ?? 0 })
    }
    if (!items.length) return NextResponse.json({ checked: 0, mismatches: 0 })

    // 배치 판정 + JSONB 병합 기록
    let checked = 0
    let mismatches = 0
    for (let i = 0; i < items.length; i += JUDGE_BATCH) {
      const chunk = items.slice(i, i + JUDGE_BATCH)
      const verdicts = await judgeStartFrames(chunk)
      if (!verdicts) continue // 키 부재/실패 — best-effort skip
      for (const item of chunk) {
        const v = verdicts.get(item.id)
        if (!v) continue
        checked++
        if (!v.match) mismatches++
        const { data: cur } = await supabaseAdmin
          .from('shots')
          .select('rough_storyboard')
          .eq('project_id', projectId)
          .eq('shot_id', item.id)
          .maybeSingle()
        const rb = (cur?.rough_storyboard as Record<string, unknown>) ?? {}
        // 경합 방어: 판정 중 재생성됐으면(다른 generatedAt) 낡은 판정을 쓰지 않는다
        if ((rb.generatedAt as number | undefined) !== metaById.get(item.id)?.generatedAt) continue
        await supabaseAdmin
          .from('shots')
          .update({
            rough_storyboard: {
              ...rb,
              adherence: {
                status: v.match ? 'ok' : 'mismatch',
                ...(v.match ? {} : { reason: v.reason }),
                checkedAt: new Date().toISOString(),
                checkedFor: rb.generatedAt ?? 0,
              },
            },
          })
          .eq('project_id', projectId)
          .eq('shot_id', item.id)
      }
    }
    return NextResponse.json({ checked, mismatches })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/rough-adherence]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
