// t0-remaining-open-api-routes — 무인증으로 열린 API 라우트 전수 + 각 라우트의 위험 동사 집계.
//   코드 추적만(HTTP 호출 0, LLM 판정 없음).
//   1차 스캔은 라우트 파일 안의 직접 호출만 봤다가 위험을 놓쳤다(웹훅·step 은 헬퍼를 통해 쓴다)
//   → 열린 라우트에 한해 **import 1단계까지 따라 들어가** 다시 센다.
// 실행: node research/experiments/t0-remaining-open-api-routes/collect.mjs
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs'

const ROOT = 'src/app/api'
const routes = []
;(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`
    if (statSync(p).isDirectory()) walk(p)
    else if (e === 'route.ts') routes.push(p)
  }
})(ROOT)

const stripComments = (src) =>
  src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*(\/\/|\*|\/\*)/.test(l))

// 가드 종류 — 티켓의 추출 규칙은 "인증 가드(requireUser/guard.ts 계열)" 유무다(= user_auth).
//   다만 사용자 인증이 아닌 다른 문지기(서명·공유 토큰·서버 비밀)도 따로 기록한다: 위험 해석이 달라진다.
const GUARD_KINDS = {
  user_auth: ['requireProjectAccess', 'getUser(', 'auth.getUser', 'requireUser'],
  signature: ['verifyFalWebhook', 'verifySignature', 'ED25519'],
  shared_secret: ['CRON_SECRET', 'WRITER_STEP_SECRET', 'x-writer-secret', 'x-cron-secret'],
  share_token: ['project_shares', 'DEMO_SHARE_COOKIE'],
}
const PAID = [/fal\.(queue|run|subscribe|stream)/, /falClient/, /@fal-ai/, /callLLM/, /generateText\(/, /anthropic\./, /generativeai/i, /runWriterSteps|triggerWriterStep/]
const WRITE = [/\.insert\(/, /\.update\(/, /\.delete\(/, /\.upsert\(/, /\.rpc\(/]
const OWNED_TABLES = ['projects', 'workspaces', 'writer_runs', 'shots', 'scenes', 'characters', 'generation_jobs', 'locations', 'project_shares']

function resolveImport(spec, fromFile) {
  if (!spec.startsWith('@/') && !spec.startsWith('.')) return null
  const base = spec.startsWith('@/')
    ? `src/${spec.slice(2)}`
    : `${fromFile.split('/').slice(0, -1).join('/')}/${spec}`
  for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) if (existsSync(cand)) return cand
  return null
}

function scanRisk(file, seen = new Set(), depth = 0) {
  if (seen.has(file) || depth > 1) return { paid: [], writes: [], tables: [] }
  seen.add(file)
  const src = readFileSync(file, 'utf8')
  const code = stripComments(src)
  const joined = code.map(([, l]) => l).join('\n')
  const hit = (pats) => code.filter(([, l]) => pats.some((p) => p.test(l))).map(([n, l]) => ({ file, line: n, code: l.trim().slice(0, 140) }))
  const out = {
    paid: hit(PAID),
    writes: hit(WRITE),
    tables: OWNED_TABLES.filter((t) => new RegExp(`from\\(['"\`]${t}['"\`]\\)`).test(joined)).map((t) => ({ file, table: t })),
  }
  for (const m of joined.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const target = resolveImport(m[1], file)
    if (!target) continue
    const sub = scanRisk(target, seen, depth + 1)
    out.paid.push(...sub.paid); out.writes.push(...sub.writes); out.tables.push(...sub.tables)
  }
  return out
}

const rows = []
for (const file of routes) {
  const src = readFileSync(file, 'utf8')
  const joined = stripComments(src).map(([, l]) => l).join('\n')
  const guards = {}
  for (const [kind, sigs] of Object.entries(GUARD_KINDS)) {
    const found = sigs.filter((s) => joined.includes(s))
    if (found.length) guards[kind] = found
  }
  rows.push({
    route: file.replace('src/app', '').replace('/route.ts', ''),
    file,
    methods: [...joined.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)/g)].map((m) => m[1]),
    guards,
    // 티켓의 추출 규칙: 사용자 인증 가드 유무
    unauthenticated: !guards.user_auth,
    other_guard: Object.keys(guards).filter((k) => k !== 'user_auth'),
  })
}

const open = rows.filter((r) => r.unauthenticated)
for (const r of open) {
  const risk = scanRisk(r.file)
  r.paid_sites = risk.paid
  r.write_sites = risk.writes
  r.owned_tables = [...new Set(risk.tables.map((t) => t.table))]
  r.risk_flag = risk.paid.length || risk.writes.length ? 'RED' : 'read-only'
}

const red = open.filter((r) => r.risk_flag === 'RED')
const out = {
  ticket: 't0-remaining-open-api-routes',
  date: '2026-08-12',
  method: '코드 추적만(HTTP 0). 사용자 인증 가드 유무로 무인증 목록 추출 → 그 목록만 import 1단계까지 위험 동사 추적.',
  routes_total: rows.length,
  unauthenticated_total: open.length,
  no_guard_at_all: open.filter((r) => r.other_guard.length === 0).map((r) => r.route),
  other_guard_only: open.filter((r) => r.other_guard.length).map((r) => ({ route: r.route, guard: r.other_guard })),
  red_routes: red.map((r) => ({
    route: r.route,
    other_guard: r.other_guard,
    paid_sample: r.paid_sites.slice(0, 4),
    write_sample: r.write_sites.slice(0, 4),
    owned_tables: r.owned_tables,
  })),
  open_routes: open,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))

console.log(`라우트 ${rows.length} / 사용자 인증 없는 라우트 ${open.length}`)
for (const r of open) {
  console.log(`  ${r.risk_flag === 'RED' ? '🔴' : '  '} ${r.route} [${r.methods}] 다른가드=${r.other_guard.join(',') || '없음'} 유료${r.paid_sites.length} 쓰기${r.write_sites.length} 테이블[${r.owned_tables.join(',')}]`)
}
