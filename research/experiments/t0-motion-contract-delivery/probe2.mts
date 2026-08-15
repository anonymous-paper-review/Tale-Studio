// 2차 — 1차에서 남은 두 질문 (읽기 전용).
//   Q1. 계약 없음 18건은 무엇인가 — 아직 안 만든 컷인가, 만들려다 실패한 컷인가.
//   Q2. 어제 배경 실험의 "카메라 모션 계약 0/54" 는 계약이 없다는 뜻인가,
//       계약은 있는데 전부 static 이라는 뜻인가. (둘은 완전히 다른 결론이다)
// 범위: SELECT 만. 픽셀 열람 없음.
// 실행: pnpm dlx tsx research/experiments/t0-motion-contract-delivery/probe2.mts
import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })
const { supabaseAdmin } = await import('@/lib/supabase/admin')
const { loadShotDesignByMainId, resolveShotDesign } = await import('@/lib/writer/shot-design-state')

const DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_LIMIT = 12

const { data: projects } = await supabaseAdmin
  .from('projects')
  .select('id, title, updated_at')
  .order('updated_at', { ascending: false })
  .limit(PROJECT_LIMIT)

const noContractDetail: Array<Record<string, unknown>> = []
const camTypeByProject: Array<Record<string, unknown>> = []
const locationBreakdown: Array<Record<string, unknown>> = []

for (const p of projects ?? []) {
  const { data: shots } = await supabaseAdmin
    .from('shots')
    .select('shot_id, dynamic_spec, design_ref, video_url, prompt, storyboard_image, location_ids, scene_id')
    .eq('project_id', p.id)
  const list = (shots ?? []) as Array<Record<string, unknown>>
  if (!list.length) continue

  const designById = await loadShotDesignByMainId(p.id)
  const usesRefs = list.some((s) => s.design_ref != null)

  const camTypes: Record<string, number> = {}
  let emptyPrompt = 0
  const byLocation: Record<string, { total: number; moving: number; emptyPrompt: number }> = {}

  for (const s of list) {
    let dyn = s.dynamic_spec as { camera_motion?: { type?: string } } | null
    if (!dyn) {
      const r = resolveShotDesign(
        designById,
        { shotId: s.shot_id as string, designRef: (s.design_ref as string | null) ?? null },
        usesRefs,
      ) as { dynamicSpec?: unknown } | null
      dyn = (r?.dynamicSpec as typeof dyn) ?? null
    }

    const promptEmpty = !(typeof s.prompt === 'string' && s.prompt.trim())
    if (promptEmpty) emptyPrompt++

    const t = dyn?.camera_motion?.type ?? (dyn ? '(계약있음·type없음)' : '(계약없음)')
    camTypes[t] = (camTypes[t] ?? 0) + 1

    const locs = Array.isArray(s.location_ids) ? (s.location_ids as string[]) : []
    const locKey = locs.length ? locs.join(',') : '(로케이션없음)'
    byLocation[locKey] ??= { total: 0, moving: 0, emptyPrompt: 0 }
    byLocation[locKey].total++
    if (dyn && t !== 'static' && t !== '(계약없음)') byLocation[locKey].moving++
    if (promptEmpty) byLocation[locKey].emptyPrompt++

    if (!dyn) {
      noContractDetail.push({
        project: p.title,
        shot_id: s.shot_id,
        design_ref: s.design_ref,
        has_video: Boolean(s.video_url),
        has_storyboard: Boolean(s.storyboard_image),
        prompt_empty: promptEmpty,
        scene_id: s.scene_id,
      })
    }
  }

  camTypeByProject.push({ title: p.title, shots: list.length, empty_prompt: emptyPrompt, ...camTypes })

  // 54샷 규모 로케이션만 (어제 배경 실험 대상 추적)
  for (const [k, v] of Object.entries(byLocation)) {
    if (v.total >= 40) locationBreakdown.push({ project: p.title, location: k.slice(0, 20), ...v })
  }
}

writeFileSync(
  join(DIR, 'result2.json'),
  JSON.stringify({ noContractDetail, camTypeByProject, locationBreakdown }, null, 2),
)

console.log('=== Q1. 계약 없음 컷의 정체 ===')
console.table(noContractDetail)
console.log('\n=== Q2. 카메라 유형 분포 + 빈 프롬프트 (프로젝트별) ===')
console.table(camTypeByProject)
console.log('\n=== 40컷 이상 로케이션 (어제 배경 실험 대상 추적) ===')
console.table(locationBreakdown)
