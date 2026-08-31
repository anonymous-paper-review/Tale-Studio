// 생성 장부 부검 — 좌표 4개(거부/생성/종결/화면반영)를 한 표로 (#a2-observability 2026-08-26).
//
// 사용: node scripts/generation-autopsy.mjs <projectId> [hours=24]
//   프로젝트의 최근 N시간 생성을 분류해 출력한다. 읽기 전용 — 아무것도 바꾸지 않는다.
//
// 해석 규칙:
//   [거부]        429 로 시작조차 못 한 생성. generation_jobs 에는 행이 없고 관측 이벤트에만 남는다.
//   [완료+반영]   잡 완료 + 화면 반영 보고(ui_reflected) 확인 — 정상.
//   [완료·미반영] 잡은 완료됐는데 화면 반영 보고가 없음. 둘 중 하나다:
//                 (a) 진짜 반영 실패 — Director 화면을 띄우고 있었는데 안 떴다면 이쪽.
//                 (b) 완료 순간 Director 화면 밖이었음 — 현재 배선은 Director 캔버스가 떠 있는
//                     동안의 완료만 보고한다. 탭을 떠나 있었다면 보고 주체가 없었던 것.
//                 구분은 사용자의 당시 위치 기억(메모)과 대조해야 한다.
//   [실패]        사유가 error 컬럼에 남는다. [finalize] 접두면 저장 단계 사망.
import { readFileSync } from 'node:fs'

const projectId = process.argv[2]
const hours = Number(process.argv[3] ?? 24)
if (!projectId) {
  console.error('usage: node scripts/generation-autopsy.mjs <projectId> [hours=24]')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
)
const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
const h = { apikey: key, Authorization: 'Bearer ' + key }
const since = new Date(Date.now() - hours * 3600_000).toISOString()
const q = async (path) => (await fetch(`${url}/rest/v1/${path}`, { headers: h })).json()

const kst = (iso) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace('T', ' ') : '—')

const [jobs, events] = await Promise.all([
  q(`generation_jobs?select=id,kind,status,error,created_at,completed_at&project_id=eq.${projectId}&created_at=gte.${since}&order=created_at.asc&limit=500`),
  q(`writer_observability_events?select=event,payload,generation_job_id,created_at&project_id=eq.${projectId}&created_at=gte.${since}&event=in.(generation_submit_rejected_quota,ui_reflected)&order=created_at.asc&limit=1000`),
])

const rejections = events.filter((e) => e.event === 'generation_submit_rejected_quota')
const reflectedAt = new Map(
  events.filter((e) => e.event === 'ui_reflected' && e.generation_job_id).map((e) => [e.generation_job_id, e.created_at]),
)

console.log(`\n생성 장부 부검 — 프로젝트 ${projectId.slice(0, 8)}…, 최근 ${hours}시간 (시각은 KST)\n`)

console.log(`[거부] 한도에 걸려 시작 못 한 생성: ${rejections.length}건`)
for (const r of rejections) {
  const p = r.payload ?? {}
  console.log(`  ${kst(r.created_at)}  ${p.kind ?? '?'}  ${p.scope === 'global' ? '전체 혼잡' : '유저 한도'} ${p.queued}/${p.limit}`)
}

// ui_reflected 배선이 있는 잡 종류만 "미반영" 판정 대상이다. Artist 스테이지(character_view·
// world_shot)는 아직 배선이 없어, 세면 전부 미반영으로 나와 진짜 신호를 묻는다(2026-08-26 실측).
const WIRED_KINDS = new Set([
  'shot_storyboard', 'storyboard_real_grid', 'shot_video', 'shot_previz_video', 'shot_rough_storyboard',
])
const completed = jobs.filter((j) => j.status === 'completed')
const wiredCompleted = completed.filter((j) => WIRED_KINDS.has(j.kind))
const unwiredCompleted = completed.filter((j) => !WIRED_KINDS.has(j.kind))
const unreflected = wiredCompleted.filter((j) => !reflectedAt.has(j.id))
const failed = jobs.filter((j) => j.status === 'failed')
const queued = jobs.filter((j) => j.status === 'queued')

console.log(`\n[완료] ${completed.length}건 (반영 측정 대상 ${wiredCompleted.length}건 — 반영됨 ${wiredCompleted.length - unreflected.length} / 미반영 ${unreflected.length})`)
if (unwiredCompleted.length) {
  const kinds = [...new Set(unwiredCompleted.map((j) => j.kind))].join(', ')
  console.log(`  측정 제외 ${unwiredCompleted.length}건 — 화면 반영 배선이 없는 종류(${kinds}). 결함이 아니라 미측정이다.`)
}
if (unreflected.length) {
  console.log('  [완료·미반영] — 당시 Director 화면을 보고 있었는지 기억과 대조할 것:')
  for (const j of unreflected) console.log(`  ${kst(j.completed_at)}  ${j.kind}  (job ${j.id.slice(0, 8)})`)
}
const lags = wiredCompleted
  .filter((j) => reflectedAt.has(j.id) && j.completed_at)
  .map((j) => (new Date(reflectedAt.get(j.id)) - new Date(j.completed_at)) / 1000)
  .sort((a, b) => a - b)
if (lags.length) {
  const pick = (p) => lags[Math.min(lags.length - 1, Math.floor(lags.length * p))].toFixed(0)
  console.log(`  완료→화면반영 지연: 중간값 ${pick(0.5)}초 / 상위10% ${pick(0.9)}초 / 최대 ${lags[lags.length - 1].toFixed(0)}초`)
}

console.log(`\n[실패] ${failed.length}건`)
for (const j of failed) console.log(`  ${kst(j.created_at)}  ${j.kind}  ${String(j.error ?? '').slice(0, 100)}`)

console.log(`\n[진행 중] ${queued.length}건`)
for (const j of queued) console.log(`  ${kst(j.created_at)}  ${j.kind}  (job ${j.id.slice(0, 8)})`)
console.log('')
