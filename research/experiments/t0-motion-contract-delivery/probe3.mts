// 3차 — 계약 없음 18건의 갈림길 (읽기 전용).
//   가설 A(조인 실패): 설계는 작업 실행 기록에 있는데 열쇠가 안 맞아 못 찾는다 → 조인 결함.
//   가설 B(미생산): 설계 자체가 만들어진 적이 없다 → 상류(샷 설계 단계)가 그 컷을 빠뜨렸다.
//   두 결론의 처방이 완전히 다르므로 반드시 가른다.
// 범위: SELECT 만.
// 실행: pnpm dlx tsx research/experiments/t0-motion-contract-delivery/probe3.mts
import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })
const { supabaseAdmin } = await import('@/lib/supabase/admin')

const DIR = dirname(fileURLToPath(import.meta.url))

// 1차에서 나온 계약 없음 컷들이 속한 프로젝트 + 대조군(같은 씬의 정상 컷)
const TARGETS: Array<{ title: string; shots: string[] }> = [
  { title: 'writer_test_260811', shots: ['sh_02_11', 'sh_04_21'] },
  { title: 'writer_test_260810', shots: ['sh_02_08', 'sh_03_15', 'sh_03_19'] },
  { title: 'Sample1', shots: ['sh_01_06', 'sh_06_44', 'sh_07_57'] },
]

const out: Array<Record<string, unknown>> = []

for (const t of TARGETS) {
  const { data: proj } = await supabaseAdmin
    .from('projects')
    .select('id, title')
    .eq('title', t.title)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!proj) continue

  // 작업 실행 기록에서 설계 뭉치를 그대로 꺼낸다 (제품 로더와 같은 쿼리 형태)
  const { data: runs } = await supabaseAdmin
    .from('writer_runs')
    .select('id, status, created_at, shotDesign:state->shotDesign')
    .eq('project_id', proj.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const rows = (runs ?? []) as Array<{ id: string; status: string; created_at: string; shotDesign: unknown }>
  const chosen =
    rows.find((r) => r.status === 'completed' && Array.isArray(r.shotDesign)) ??
    rows.find((r) => Array.isArray(r.shotDesign))

  const designed = new Set<string>()
  if (chosen && Array.isArray(chosen.shotDesign)) {
    for (const d of chosen.shotDesign as Array<{ static_spec?: { shot_id?: string }; intent?: { shot_id?: string } }>) {
      const id = d?.static_spec?.shot_id ?? d?.intent?.shot_id
      if (id) designed.add(id)
    }
  }

  // 이 프로젝트의 전체 컷 목록 (설계에 있는데 컷이 없는 경우도 보기 위해)
  const { data: allShots } = await supabaseAdmin
    .from('shots')
    .select('shot_id')
    .eq('project_id', proj.id)
  const shotIds = new Set((allShots ?? []).map((s) => s.shot_id as string))

  out.push({
    project: t.title,
    runs_scanned: rows.length,
    run_statuses: rows.map((r) => r.status).join(','),
    chosen_run_status: chosen?.status ?? '(없음)',
    designs_in_run: designed.size,
    shots_in_db: shotIds.size,
    문제컷_설계에있나: t.shots.map((s) => `${s}:${designed.has(s) ? '있음' : '없음'}`).join(' '),
    설계에만있고_컷없음: [...designed].filter((d) => !shotIds.has(d)).slice(0, 10),
    컷에만있고_설계없음_총계: [...shotIds].filter((s) => !designed.has(s)).length,
    컷에만있고_설계없음_예시: [...shotIds].filter((s) => !designed.has(s)).slice(0, 10),
  })
}

writeFileSync(join(DIR, 'result3.json'), JSON.stringify(out, null, 2))
for (const r of out) {
  console.log('\n===', r.project, '===')
  for (const [k, v] of Object.entries(r)) {
    if (k === 'project') continue
    console.log(` ${k}:`, Array.isArray(v) ? JSON.stringify(v) : v)
  }
}
