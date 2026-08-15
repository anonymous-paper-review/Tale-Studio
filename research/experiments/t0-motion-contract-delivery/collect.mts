// 카메라 지시서가 영상까지 실제로 전달되는가 — 최신 작업 기준 실측 (읽기 전용).
//
// 왜: generate-video 라우트는 shots.dynamic_spec 이 비면 writer_runs.state 를 뒤지는
//   예비 경로를 타고(route.ts:457-478), 그마저 실패하면 catch 에서 조용히 null 로 진행한다.
//   계약이 null 이면 compileMotionContract 가 빈 문자열을 돌려주므로(motion-contract.ts:152)
//   영상 모델은 카메라 지시를 한 글자도 못 받는다. 그 무신호 실패의 빈도를 센다.
//
// 대전제(rules/experiments.md): 과거가 아니라 **최신 작업**으로 판단한다.
//   프로젝트를 최신 갱신순으로 정렬해 상위 N건만 본다. 세대별 대조를 위해 생성 시점을 같이 남긴다.
//
// 범위: SELECT 만. 쓰기 없음. 생성 발주 없음. 이미지·영상 열람 없음(픽셀 해석 금지 대전제).
// 실행: pnpm dlx tsx research/experiments/t0-motion-contract-delivery/collect.mts
import { config } from 'dotenv'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

// 정적 import 는 dotenv 보다 먼저 평가돼 admin 클라이언트가 빈 URL 로 생성된다 → 동적 import.
const { supabaseAdmin } = await import('@/lib/supabase/admin')
// 예비 경로의 실제 해석기를 그대로 쓴다 — 복붙 금지 규칙(실험은 제품 함수를 호출만).
const { loadShotDesignByMainId, resolveShotDesign } = await import('@/lib/writer/shot-design-state')

const DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_LIMIT = Number(process.env.PROJECT_LIMIT ?? 12)

type ShotRow = {
  shot_id: string
  project_id: string
  dynamic_spec: unknown
  design_ref: string | null
  video_url: string | null
  prompt: string | null
  created_at: string
  updated_at: string
}

// ── 1) 최신 작업부터 (대전제: 과거로 판단하지 않는다) ──
const { data: projects, error: projErr } = await supabaseAdmin
  .from('projects')
  .select('id, title, created_at, updated_at')
  .order('updated_at', { ascending: false })
  .limit(PROJECT_LIMIT)

if (projErr) throw new Error(`projects 조회 실패: ${projErr.message}`)

const rows: Array<Record<string, unknown>> = []

for (const p of projects ?? []) {
  const { data: shots, error: shotErr } = await supabaseAdmin
    .from('shots')
    .select('shot_id, project_id, dynamic_spec, design_ref, video_url, prompt, created_at, updated_at')
    .eq('project_id', p.id)

  if (shotErr) {
    rows.push({ project_id: p.id, title: p.title, error: shotErr.message })
    continue
  }

  const list = (shots ?? []) as ShotRow[]
  if (list.length === 0) continue

  // 예비 경로가 실제로 무엇을 찾아내는지 — 제품 로더를 그대로 호출한다.
  const designById = await loadShotDesignByMainId(p.id)
  const usesRefs = list.some((s) => s.design_ref != null)

  let onRow = 0 // 컷 기록에 지시서가 있음 (예비 경로 불필요)
  let viaFallback = 0 // 비었지만 예비 경로가 찾아냄
  let noContract = 0 // 비었고 예비 경로도 빈손 → 계약문 빈 문자열로 발주
  let noContractWithVideo = 0 // 그중 실제로 영상이 만들어진 것 = 지시 없이 나간 클립

  const casualties: Array<Record<string, unknown>> = []

  for (const s of list) {
    if (s.dynamic_spec != null) {
      onRow++
      continue
    }
    const resolved = resolveShotDesign(
      designById,
      { shotId: s.shot_id, designRef: s.design_ref },
      usesRefs,
    ) as { dynamicSpec?: unknown } | null
    if (resolved?.dynamicSpec) {
      viaFallback++
    } else {
      noContract++
      if (s.video_url) {
        noContractWithVideo++
        if (casualties.length < 5) {
          casualties.push({
            shot_id: s.shot_id,
            design_ref: s.design_ref,
            has_prompt: Boolean(s.prompt && s.prompt.trim()),
            created_at: s.created_at,
          })
        }
      }
    }
  }

  rows.push({
    project_id: p.id,
    title: p.title,
    project_updated_at: p.updated_at,
    project_created_at: p.created_at,
    shots_total: list.length,
    uses_design_refs: usesRefs,
    design_state_entries: designById.size,
    on_row: onRow,
    via_fallback: viaFallback,
    no_contract: noContract,
    no_contract_with_video: noContractWithVideo,
    casualties_sample: casualties,
  })
}

type Totals = {
  shots_total: number
  on_row: number
  via_fallback: number
  no_contract: number
  no_contract_with_video: number
}

const totals = rows.reduce<Totals>(
  (a, r) => {
    a.shots_total += Number(r.shots_total ?? 0)
    a.on_row += Number(r.on_row ?? 0)
    a.via_fallback += Number(r.via_fallback ?? 0)
    a.no_contract += Number(r.no_contract ?? 0)
    a.no_contract_with_video += Number(r.no_contract_with_video ?? 0)
    return a
  },
  { shots_total: 0, on_row: 0, via_fallback: 0, no_contract: 0, no_contract_with_video: 0 },
)

mkdirSync(DIR, { recursive: true })
writeFileSync(
  join(DIR, 'result.json'),
  JSON.stringify({ collected_at_note: '실행 시각은 파일 mtime', project_limit: PROJECT_LIMIT, totals, projects: rows }, null, 2),
)

console.log('=== 합계 (최신 프로젝트 %d건) ===', PROJECT_LIMIT)
console.table([totals])
console.log('\n=== 프로젝트별 (최신순) ===')
console.table(
  rows.map((r) => ({
    title: String(r.title ?? '').slice(0, 24),
    updated: String(r.project_updated_at ?? '').slice(0, 10),
    shots: r.shots_total,
    컷기록보유: r.on_row,
    예비경로복구: r.via_fallback,
    계약없음: r.no_contract,
    계약없이영상나감: r.no_contract_with_video,
  })),
)
