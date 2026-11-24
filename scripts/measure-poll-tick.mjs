// 폴링 한 틱의 소요 시간을 초로 잰다 — 고치기 전/후 비교용(2026-11-24 1층 폴링 최적화).
//
// 왜: 11/23 수업 장애의 원인 가운데 "틱 하나가 무겁다(요청마다 Auth 왕복 + DB 여러 번)"를
//     숫자로 확인하려면 같은 서버·같은 DB 에 같은 요청을 N번 보내 중앙값·p95 를 비교해야 한다.
//     비용은 보지 않고 시간만 본다(오너 지시).
//
// 사용: node scripts/measure-poll-tick.mjs [--base http://localhost:3000] [--n 20] [--email <계정>] [--label before]
//   · 세션은 scripts/admin-session-cookie.mjs 와 같은 경로(magic link → verify)로 발급한다.
//   · 잴 대상(프로젝트 1개 · queued 또는 completed 잡 몇 개)은 그 계정의 DB 에서 service role 로 찾는다.
//   · stdout 에 JSON 한 줄(라벨 · 요청별 중앙값/p95/최대, 초 단위). stderr 에 사람용 표.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true'])
    return acc
  }, []),
)
const base = (args.base ?? 'http://localhost:3000').replace(/\/$/, '')
const n = Number(args.n ?? 20)
const label = args.label ?? 'run'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
)
const email = args.email ?? env.E2E_EMAIL
if (!email) throw new Error('--email 또는 .env.local 의 E2E_EMAIL 이 필요하다')
const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, '')
const service = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY

// 1) 세션 쿠키
const cookies = JSON.parse(
  execFileSync('node', [new URL('./admin-session-cookie.mjs', import.meta.url).pathname, email], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }),
)
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

// 2) 잴 대상 찾기 — 그 계정의 워크스페이스 → 프로젝트 → 최근 잡
async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}
const [user] = await rest(`users_view?select=id&email=eq.${encodeURIComponent(email)}`).catch(() => [])
const userId = user?.id ?? (await (async () => {
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })
  const body = await res.json()
  return body.users?.find((u) => u.email === email)?.id
})())
if (!userId) throw new Error(`${email} 사용자를 찾지 못했다`)
const workspaces = await rest(`workspaces?select=id&owner_id=eq.${userId}`)
const wsIds = workspaces.map((w) => w.id)
if (wsIds.length === 0) throw new Error('워크스페이스가 없다')
const jobs = await rest(
  `generation_jobs?select=id,project_id,status,kind,created_at&workspace_id=in.(${wsIds.join(',')})&order=created_at.desc&limit=200`,
)
const queued = jobs.filter((j) => j.status === 'queued')
const completed = jobs.filter((j) => j.status === 'completed')
// 끝난 잡을 먼저 고른다 — fal 왕복이 끼지 않아 Auth + DB 비용만 남는다(이번에 줄이려는 부분).
const target = completed[0] ?? queued[0]
if (!target) throw new Error('잴 잡이 없다 — 이 계정으로 그림을 하나 만들어 두고 다시 실행')
const projectId = target.project_id
const sameProject = jobs.filter((j) => j.project_id === projectId).slice(0, 6).map((j) => j.id)

// 3) 요청 시간 측정
async function timeIt(name, doFetch, count = n) {
  const samples = []
  let failures = 0
  for (let i = 0; i < count; i++) {
    const t0 = performance.now()
    try {
      const res = await doFetch()
      await res.text()
      if (!res.ok) failures += 1
    } catch {
      failures += 1
    }
    samples.push((performance.now() - t0) / 1000)
  }
  samples.sort((a, b) => a - b)
  const q = (p) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))]
  return { name, n: count, median_s: +q(0.5).toFixed(3), p95_s: +q(0.95).toFixed(3), max_s: +samples[samples.length - 1].toFixed(3), failures }
}
const headers = { cookie: cookieHeader }
// 예열 1회(콜드 스타트 · JWKS 첫 내려받기 제외)
await fetch(`${base}/api/generation-jobs/${target.id}`, { headers }).then((r) => r.text())
await fetch(`${base}/api/generation/active?projectId=${projectId}`, { headers }).then((r) => r.text())

const results = []
results.push(await timeIt('generation-jobs/[id] (잡 1개 상태)', () => fetch(`${base}/api/generation-jobs/${target.id}`, { headers })))
results.push(await timeIt('generation/active (프로젝트 진행 목록)', () => fetch(`${base}/api/generation/active?projectId=${projectId}`, { headers })))
// 여러 잡 한 번에 — 고친 뒤에만 있는 경로. 404 면 failures 로 남는다.
results.push(
  await timeIt(`generation-jobs?ids= (잡 ${sameProject.length}개 한 번에)`, () =>
    fetch(`${base}/api/generation-jobs?ids=${sameProject.join(',')}`, { headers }),
  ),
)
// 같은 잡을 6개 따로 묻기(고치기 전 화면이 하던 일) — 한 틱의 체감 시간
results.push(
  await timeIt(`generation-jobs/[id] x${sameProject.length} 동시 (고치기 전 틱)`, async () => {
    const all = await Promise.all(sameProject.map((id) => fetch(`${base}/api/generation-jobs/${id}`, { headers })))
    return { ok: all.every((r) => r.ok), text: async () => Promise.all(all.map((r) => r.text())) }
  }, Math.max(5, Math.floor(n / 2))),
)

const out = { label, base, at: new Date().toISOString(), projectId, jobId: target.id, jobStatus: target.status, results }
console.log(JSON.stringify(out))
console.error(`\n[${label}] ${base} · 잡 ${target.id.slice(0, 8)} (${target.status})`)
for (const r of results) console.error(`  ${r.name.padEnd(44)} 중앙값 ${r.median_s}s  p95 ${r.p95_s}s  최대 ${r.max_s}s  실패 ${r.failures}/${r.n}`)
