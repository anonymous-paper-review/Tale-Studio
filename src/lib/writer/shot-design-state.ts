// L4(shotDesign) 원본을 writer_runs.state 에서 회수해 shot id 로 색인 — 공용 로더.
//   원래 러프보드 라우트 로컬이던 것을 이관(#motion-contract 2026-08-07): 비디오 라우트도
//   구버전 프로젝트(shots.dynamic_spec 미보유)의 모션 계약 폴백으로 같은 조인을 쓴다.
//   persist 가 V축 facet 을 평탄화하며 버리던 시절의 run 도 state 원본으로 커버.
//   run 이 없거나 구버전이면 빈 맵 — 호출부가 DB fallback 으로 처리. best-effort (throw 금지).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writerShotIdToMain } from '@/lib/writer/adapters'
import type { RoughStoryboardSpec } from '@/lib/writer/rough-storyboard'
import type { ShotDesign } from '@/lib/writer/types/pipeline'

export async function loadShotDesignByMainId(
  projectId: string,
): Promise<Map<string, RoughStoryboardSpec>> {
  const byId = new Map<string, RoughStoryboardSpec>()
  try {
    const { data: runs } = await supabaseAdmin
      .from('writer_runs')
      .select('status, shotDesign:state->shotDesign')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5)
    const rows = (runs ?? []) as Array<{ status: string; shotDesign: unknown }>
    const row =
      rows.find((r) => r.status === 'completed' && Array.isArray(r.shotDesign)) ??
      rows.find((r) => Array.isArray(r.shotDesign))
    if (!row) return byId
    for (const d of row.shotDesign as ShotDesign[]) {
      const writerShotId = d?.static_spec?.shot_id ?? d?.intent?.shot_id
      const writerSceneId = d?.intent?.scene_id
      if (!writerShotId || !writerSceneId) continue
      const spec = {
        staticSpec: d.static_spec,
        intent: d.intent,
        dynamicSpec: d.dynamic_spec,
      }
      // main 정규화 id(구 행 폴백 조인 키) + 원본 writer id(#p2-wiring: shots.design_ref 조인 키).
      //   분할·리넘버를 겪은 프로젝트는 main id 조인이 옆 샷 스펙에 꽂히던 오프셋 결함(진단:
      //   lab/previz-quality — scene_2 +1, scene_3 +2)이 있어 design_ref 조인이 진실이다.
      byId.set(writerShotIdToMain(writerShotId, writerSceneId), spec)
      byId.set(writerShotId, spec)
    }
  } catch (e) {
    console.error('[shot-design-state] shotDesign state load failed:', e)
  }
  return byId
}
