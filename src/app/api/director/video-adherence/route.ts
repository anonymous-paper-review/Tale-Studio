// POST /api/director/video-adherence — 영상 모션 계약 준수 검사(#adherence P2).
//   클라가 완료된 영상의 첫/끝 프레임을 캡처해 보내면(브라우저가 디코더 — 서버리스에 ffmpeg 없음),
//   서버가 결정론 픽셀 diff(정지 위반/변화 부족) + 방향성 이동 VLM 판정 후
//   video_clips.adherence 에 기록하고 판정을 돌려준다. best-effort — 실패는 플로우를 막지 않는다.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { isAdminOwnedProject } from '@/lib/admin'
import { userOwnsProject } from '@/lib/generation-jobs'
import { ADHERENCE_MOTION_ENABLED, directionExpectationText, judgeMotionByDiff, motionExpectation } from '@/lib/adherence/core'
import { judgeDirection, meanFrameDiff } from '@/lib/adherence/vision'
import { loadShotDesignByMainId, resolveShotDesign } from '@/lib/writer/shot-design-state'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 60

// dataURL 프리픽스 허용 + 순수 b64 허용. 캡처는 512px jpeg q0.7 — 프레임당 수십 KB 수준.
const frameSchema = z.string().min(100).max(1_500_000)
const BodySchema = z.object({
  projectId: z.string().uuid(),
  writerShotId: z.string().min(1),
  videoClipId: z.string().uuid(),
  firstFrame: frameSchema,
  lastFrame: frameSchema,
})

function stripDataUrl(s: string): string {
  const m = /^data:image\/[a-z]+;base64,(.*)$/i.exec(s)
  return m ? m[1] : s
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
    if (!ADHERENCE_MOTION_ENABLED) return NextResponse.json({ status: 'skipped', reason: 'disabled' })
    const { projectId, writerShotId, videoClipId, firstFrame, lastFrame } = parsed.data
    if (!(await userOwnsProject(projectId, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // 관리자 소유 프로젝트 한정(사용자 결정 2026-08-07) — 일반 사용자는 조용한 skip(200).
    if (!(await isAdminOwnedProject(user, projectId))) {
      return NextResponse.json({ status: 'skipped', reason: 'admin only' })
    }

    // 클립 소유 확인 (다른 샷/프로젝트의 클립에 기록 방지)
    const { data: clip } = await supabaseAdmin
      .from('video_clips')
      .select('id, shot_id')
      .eq('id', videoClipId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (!clip || clip.shot_id !== writerShotId) {
      return NextResponse.json({ error: 'clip does not belong to shot' }, { status: 400 })
    }

    // 모션 기대치: shots.dynamic_spec 우선 → 구버전은 state.shotDesign 폴백(#motion-contract 와 동일)
    const { data: shot } = await supabaseAdmin
      .from('shots')
      .select('dynamic_spec, design_ref')
      .eq('project_id', projectId)
      .eq('shot_id', writerShotId)
      .maybeSingle()
    let dyn = (shot?.dynamic_spec as ShotDynamicSpec | null) ?? null
    if (!dyn) {
      // #split-spec: ref 없는 샷(분할 자식)의 main-id 폴백 금지 — 옆 샷 설계 오조인 방지.
      const { count } = await supabaseAdmin
        .from('shots')
        .select('shot_id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .not('design_ref', 'is', null)
      const byId = await loadShotDesignByMainId(projectId)
      dyn =
        resolveShotDesign(byId, {
          shotId: writerShotId,
          designRef: (shot?.design_ref as string | null) ?? null,
        }, (count ?? 0) > 0)?.dynamicSpec ?? null
    }
    const exp = motionExpectation(dyn)
    if (!exp) return NextResponse.json({ status: 'skipped', reason: 'no dynamic_spec' })

    const first = stripDataUrl(firstFrame)
    const last = stripDataUrl(lastFrame)
    const meanDiff = await meanFrameDiff(first, last)
    if (meanDiff == null) return NextResponse.json({ status: 'skipped', reason: 'frame decode failed' })

    // 결정론 판정 → 통과 시 방향성 이동만 VLM 확인
    let verdict: { status: string; reason?: string; observed?: string } = judgeMotionByDiff(meanDiff, exp)
    if (verdict.status === 'ok' && exp.directional) {
      const expected = directionExpectationText(exp.directional)
      const dir = await judgeDirection(first, last, expected)
      if (dir && !dir.match) {
        verdict = { status: 'direction_mismatch', reason: `기대: ${expected}`, observed: dir.observed }
      }
    }

    const adherence = {
      ...verdict,
      meanDiff: +meanDiff.toFixed(1),
      cameraStatic: exp.cameraStatic,
      checkedAt: new Date().toISOString(),
    }
    await supabaseAdmin.from('video_clips').update({ adherence }).eq('id', videoClipId)
    return NextResponse.json(adherence)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[director/video-adherence]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
