#!/usr/bin/env node
// src/types/database.ts 를 개발 Supabase 스키마에서 다시 만든다 (#db-types-drift 2026-09-08).
//
// 기준은 개발 DB다 — CLAUDE.md 의 "개발 DB 먼저 → live 순서" 때문에 live 에는 아직 안 올라간
//   마이그레이션이 있을 수 있고, 코드(dev 브랜치)는 개발 DB 를 본다. live 로 뽑으면 방금 만든
//   함수·표가 타입에서 빠져 "코드엔 있는데 타입엔 없는" 상태가 된다(실제로 take_expire_due 가 그랬다).
//
// 사용: pnpm db:types
//   .env.local 의 SUPABASE_DEV_URL 에서 project ref 를 뽑고 SUPABASE_ACCESS_TOKEN 으로 인증한다.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const OUT = 'src/types/database.ts'

function loadEnvLocal() {
  let raw = ''
  try {
    raw = readFileSync('.env.local', 'utf8')
  } catch {
    return {}
  }
  const env = {}
  for (const line of raw.split('\n')) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return env
}

function projectRef(url) {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url ?? '')
  return match?.[1] ?? null
}

const env = { ...loadEnvLocal(), ...process.env }
const ref = projectRef(env.SUPABASE_DEV_URL)

if (!ref) {
  console.error('SUPABASE_DEV_URL 이 없거나 형식이 다르다 (.env.local 확인)')
  process.exit(1)
}
if (!env.SUPABASE_ACCESS_TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN 이 없다 (.env.local 확인)')
  process.exit(1)
}

console.log(`[db:types] 개발 DB(${ref}) 스키마로 ${OUT} 를 다시 만든다`)

const generated = execFileSync(
  'npx',
  ['supabase', 'gen', 'types', 'typescript', '--project-id', ref],
  { env: { ...process.env, SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
)

if (!generated.includes('__InternalSupabase')) {
  console.error('[db:types] 생성 결과가 Supabase 타입 파일 형식이 아니다 — 반영하지 않는다')
  process.exit(1)
}

const before = (() => {
  try {
    return readFileSync(OUT, 'utf8')
  } catch {
    return ''
  }
})()

writeFileSync(OUT, generated)

const countTables = (source) => (source.match(/^ {6}[a-z_][a-z0-9_]*: \{$/gm) ?? []).length
console.log(
  before === generated
    ? '[db:types] 변경 없음 — 이미 최신이다'
    : `[db:types] 갱신됨 — 표·함수 ${countTables(before)}개 → ${countTables(generated)}개`,
)
