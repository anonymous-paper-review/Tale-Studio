// t0-scene-schema-typo-prevalence — 씬 필드 오타/누락이 여러 런에 걸쳐 실존하는가.
//   전수 집계는 코드로만(LLM 판정 없음). read-only.
// 실행: node research/experiments/t0-scene-schema-typo-prevalence/collect.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

// 씬 타입 정본 — src/lib/writer/types/pipeline.ts:306-327 StoryScene (원문 필드명 그대로)
const CANON = [
  'scene_id', 'act_ref', 'location', 'time_of_day', 'weather', 'characters_in_scene', 'purpose',
  'emotion_beat', 'dialogue_summary', 'key_dialogue', 'info_asymmetry', 'estimated_seconds', 'scene_actions',
]
// 느슨한 스키마가 실제로 검사하는 필드 — schemas.ts:52-56 StorySceneLooseSchema
const CHECKED = ['scene_id', 'location', 'scene_actions']

const { data: runs, error } = await db
  .from('writer_runs')
  .select('id,project_id,status,created_at,state')
  .order('created_at', { ascending: true })
if (error) throw error

const runRows = []
const offKeyDist = {}
const violatingRuns = new Set()
let sceneTotal = 0
let violatingScenes = 0

for (const run of runs ?? []) {
  const scenes = run.state?.scenes?.scenes ?? run.state?.scenes ?? null
  if (!Array.isArray(scenes)) continue
  const bad = []
  for (const sc of scenes) {
    if (!sc || typeof sc !== 'object') continue
    sceneTotal++
    const keys = Object.keys(sc)
    const offCanon = keys.filter((k) => !CANON.includes(k))
    const cis = sc.characters_in_scene
    const cisMissing = cis === undefined || cis === null
    const cisWrongType = !cisMissing && !Array.isArray(cis)
    if (cisMissing || cisWrongType || offCanon.length) {
      violatingScenes++
      violatingRuns.add(run.id)
      for (const k of offCanon) (offKeyDist[k] ??= { n: 0, runs: new Set() }), offKeyDist[k].n++, offKeyDist[k].runs.add(run.id)
      bad.push({
        scene_id: sc.scene_id ?? null,
        characters_in_scene_missing: cisMissing,
        characters_in_scene_wrong_type: cisWrongType,
        off_canon_keys: offCanon,
      })
    }
  }
  runRows.push({
    run_id: run.id,
    project_id: run.project_id,
    status: run.status,
    created_at: run.created_at,
    scenes: scenes.length,
    violating_scenes: bad.length,
    detail: bad,
  })
}

const out = {
  ticket: 't0-scene-schema-typo-prevalence',
  date: '2026-08-12',
  canon_source: 'src/lib/writer/types/pipeline.ts:306-327 StoryScene',
  checked_by_loose_schema: CHECKED,
  unchecked_fields: CANON.filter((f) => !CHECKED.includes(f)),
  runs_with_scenes: runRows.length,
  scenes_total: sceneTotal,
  violating_scenes: violatingScenes,
  violating_runs: [...violatingRuns],
  off_canon_key_distribution: Object.fromEntries(
    Object.entries(offKeyDist).map(([k, v]) => [k, { n: v.n, runs: [...v.runs].length }]),
  ),
  runs: runRows,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`씬 보유 런 ${runRows.length} / 씬 ${sceneTotal} / 위반 씬 ${violatingScenes} / 위반 런 ${violatingRuns.size}`)
console.log('정본 밖 키 분포:', JSON.stringify(out.off_canon_key_distribution))
for (const r of runRows.filter((r) => r.violating_scenes)) {
  console.log(`  ${r.created_at?.slice(0, 10)} ${r.run_id.slice(0, 8)} proj=${r.project_id?.slice(0, 8)} status=${r.status} 위반 ${r.violating_scenes}/${r.scenes}`)
}
