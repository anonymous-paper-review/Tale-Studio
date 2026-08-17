// 구조 확인 전용 — 티켓에 적힌 필드 경로가 실제 DB에 있는지 대조한다. 읽기 전용.
//   usage: node research/experiments/color-temp-ramp/probe-structure.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
)

// 1) shots 한 행 전체 컬럼
const { data: oneShot, error: e1 } = await db
  .from('shots')
  .select('*')
  .not('static_spec', 'is', null)
  .limit(1)
console.log('=== shots 컬럼 목록 ===')
if (e1) console.log('ERROR', e1.message)
else console.log(Object.keys(oneShot?.[0] ?? {}).join(', '))

console.log('\n=== static_spec 최상위 키 ===')
console.log(Object.keys(oneShot?.[0]?.static_spec ?? {}).join(', '))

console.log('\n=== static_spec.lighting 전체 ===')
console.log(JSON.stringify(oneShot?.[0]?.static_spec?.lighting ?? null, null, 2))

// 2) scenes 한 행 전체 컬럼
const { data: oneScene, error: e2 } = await db.from('scenes').select('*').limit(1)
console.log('\n=== scenes 컬럼 목록 ===')
if (e2) console.log('ERROR', e2.message)
else console.log(Object.keys(oneScene?.[0] ?? {}).join(', '))
console.log('scenes 샘플 time_of_day =', JSON.stringify(oneScene?.[0]?.time_of_day))

// 3) 규모 카운트
for (const [label, q] of [
  ['shots 전체', db.from('shots').select('id', { count: 'exact', head: true })],
  [
    'shots static_spec 있음',
    db.from('shots').select('id', { count: 'exact', head: true }).not('static_spec', 'is', null),
  ],
  ['scenes 전체', db.from('scenes').select('id', { count: 'exact', head: true })],
]) {
  const { count, error } = await q
  console.log(`\n${label}: ${error ? 'ERROR ' + error.message : count}`)
}

// 4) lighting 하위 키 빈도 (500개 표본) — color_temp_kelvin 이름이 실제로 쓰이는지
const { data: sample } = await db
  .from('shots')
  .select('static_spec')
  .not('static_spec', 'is', null)
  .limit(500)
const lightingKeyFreq = {}
const topKeyFreq = {}
let lightingPresent = 0
for (const r of sample ?? []) {
  for (const k of Object.keys(r.static_spec ?? {})) topKeyFreq[k] = (topKeyFreq[k] ?? 0) + 1
  const lg = r.static_spec?.lighting
  if (lg && typeof lg === 'object') {
    lightingPresent++
    for (const k of Object.keys(lg)) lightingKeyFreq[k] = (lightingKeyFreq[k] ?? 0) + 1
  }
}
console.log(`\n=== 표본 ${sample?.length ?? 0}개 static_spec 최상위 키 빈도 ===`)
console.log(JSON.stringify(topKeyFreq, null, 2))
console.log(`\n=== lighting 객체 있는 샷 ${lightingPresent}개, 하위 키 빈도 ===`)
console.log(JSON.stringify(lightingKeyFreq, null, 2))

// 5) time_of_day 값 분포
const { data: tods } = await db.from('scenes').select('time_of_day').limit(2000)
const todFreq = {}
for (const r of tods ?? []) todFreq[String(r.time_of_day)] = (todFreq[String(r.time_of_day)] ?? 0) + 1
console.log('\n=== scenes.time_of_day 값 분포 ===')
console.log(JSON.stringify(todFreq, null, 2))
