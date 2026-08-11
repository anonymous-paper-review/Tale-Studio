// t0-dynamic-spec-enum-audit — v4 산출층 dynamic_spec의 enum 밖 값 실존 감사.
//   enum 정본(Phase 0 인용): src/lib/writer/types/pipeline.ts:649-687 ShotDynamicSpec.
//   소스: DB 3프로젝트 writer_runs.state.shotDesign[].dynamic_spec (+ w260810 shots.dynamic_spec 교차)
//        + 로컬 3런 logs/*/11_v4_shotDesign.json shots[].dynamic_spec.
//   usage: node research/experiments/t0-dynamic-spec-enum-audit/collect.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

// enum 정본 — types/pipeline.ts ShotDynamicSpec (원문 그대로)
const ENUMS = {
  'camera_motion.type': ['static', 'pan', 'tilt', 'dolly_in', 'dolly_out', 'tracking', 'crane', 'handheld_drift', 'rack_focus'],
  'camera_motion.speed': ['slow', 'medium', 'fast'],
  'camera_motion.magnitude': ['minimal', 'moderate', 'large'],
  'character_motion[].magnitude': ['micro', 'small', 'medium', 'large'],
  'environmental_change[].magnitude': ['subtle', 'moderate', 'strong'],
  'transition_in': ['cut', 'fade', 'dissolve', 'match_cut', 'pre_lap', 'l_cut'],
  'transition_out': ['cut', 'fade', 'dissolve', 'match_cut', 'j_cut'],
}

const violations = []
const valueDist = {}
const tally = (field, value, where) => {
  if (value === undefined || value === null) return
  ;((valueDist[field] ??= {})[String(value)] ??= { n: 0 })
  valueDist[field][String(value)].n++
  if (!ENUMS[field].includes(value)) violations.push({ field, value, where })
}

function auditSpec(spec, where) {
  if (!spec) return
  tally('camera_motion.type', spec.camera_motion?.type, where)
  tally('camera_motion.speed', spec.camera_motion?.speed, where)
  tally('camera_motion.magnitude', spec.camera_motion?.magnitude, where)
  for (const cm of spec.character_motion ?? []) tally('character_motion[].magnitude', cm?.magnitude, where)
  for (const ec of spec.environmental_change ?? []) tally('environmental_change[].magnitude', ec?.magnitude, where)
  tally('transition_in', spec.transition_in, where)
  tally('transition_out', spec.transition_out, where)
}

let specCount = 0
// 로컬 3런
for (const d of ['064631aa-f6b2-4f7c-800b-66b0517a2769', '5260d92d-2e7b-4991-8bff-00213b37ef77', 'e4da245a-8d89-44e5-8fde-131d016ef2e3']) {
  const v4 = JSON.parse(readFileSync(new URL(`../../../logs/${d}/11_v4_shotDesign.json`, import.meta.url), 'utf8'))
  for (const s of v4.shots) { auditSpec(s.dynamic_spec, `local:${d.slice(0, 8)}/${s.dynamic_spec?.shot_id ?? s.intent?.shot_id}`); specCount++ }
}
// DB 3프로젝트 — state.shotDesign
const { data: projs } = await db.from('projects').select('id,title')
for (const pref of ['9d6efa6d', 'e1a9fd08', '04926a0a']) {
  const p = projs.find((x) => x.id.startsWith(pref))
  const { data: runs } = await db.from('writer_runs').select('state').eq('project_id', p.id).order('created_at', { ascending: false }).limit(1)
  const sd = runs?.[0]?.state?.shotDesign
  const items = Array.isArray(sd) ? sd : Object.values(sd ?? {})
  for (const it of items) { auditSpec(it?.dynamic_spec, `db:${p.title}/${it?.dynamic_spec?.shot_id ?? it?.intent?.shot_id}`); specCount++ }
}
// 교차: w260810 shots.dynamic_spec (신 persist 경로)
const w = projs.find((x) => x.id.startsWith('e1a9fd08'))
const { data: wShots } = await db.from('shots').select('shot_id,dynamic_spec').eq('project_id', w.id)
for (const s of wShots ?? []) auditSpec(s.dynamic_spec, `db-shots:writer_test_260810/${s.shot_id}`)

const out = {
  ticket: 't0-dynamic-spec-enum-audit', date: '2026-08-11',
  enum_source: 'src/lib/writer/types/pipeline.ts:649-687 (ShotDynamicSpec) — 원문 enum은 results 하단 enums 참조',
  enums: ENUMS,
  audited_specs: specCount,
  value_distribution: valueDist,
  violations_count: violations.length,
  violations,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('specs:', specCount, '| violations:', violations.length)
for (const [f, d] of Object.entries(valueDist)) {
  const bad = Object.keys(d).filter((v) => !ENUMS[f].includes(v))
  console.log(f, JSON.stringify(d), bad.length ? `⚠ 밖값: ${bad.join(',')}` : '✓')
}
