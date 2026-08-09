// previz 검증기 — 수집기. live DB에서 검증 대상 스냅샷을 동결한다.
//   usage: node research/experiments/previz-verifier/collect.mjs <projectId> <outDir>
//   산출: <outDir>/data.json (설계·샷·씬 전체), <outDir>/frames/<shotId>_{start|direction|end}.png
import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const projectId = process.argv[2]
const outDir = process.argv[3]
if (!projectId || !outDir) throw new Error('usage: collect.mjs <projectId> <outDir>')

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
)

mkdirSync(join(outDir, 'frames'), { recursive: true })

const { data: proj, error: projErr } = await db
  .from('projects').select('id, title, current_stage').eq('id', projectId).single()
if (projErr) throw projErr

const { data: shots, error: shotsErr } = await db
  .from('shots').select('*').eq('project_id', projectId).order('sort_order')
if (shotsErr) throw shotsErr

const { data: runs, error: runsErr } = await db
  .from('writer_runs').select('id, status, created_at, state')
  .eq('project_id', projectId).order('created_at', { ascending: false }).limit(1)
if (runsErr) throw runsErr
const run = runs?.[0]
const state = run?.state ?? {}

const data = {
  collectedAt: new Date().toISOString(),
  project: proj,
  writerRun: run ? { id: run.id, status: run.status, created_at: run.created_at } : null,
  stateKeys: Object.keys(state),
  scenes: state.scenes ?? null,
  narrativeStructure: state.narrativeStructure ?? null,
  decoupage: state.decoupage ?? null,
  sceneCinematography: state.sceneCinematography ?? null,
  shotDesign: state.shotDesign ?? null,
  shots,
}
writeFileSync(join(outDir, 'data.json'), JSON.stringify(data, null, 2))

// 프레임 다운로드
let ok = 0, miss = 0, fail = 0
for (const s of shots) {
  const rs = s.rough_storyboard
  // 신포맷(3프레임) 우선, 구포맷(단일 패널 url) 폴백
  const frames = rs?.frames?.start ? rs.frames : rs?.url ? { panel: rs.url } : null
  if (!frames) { miss++; continue }
  for (const [key, url] of Object.entries(frames)) {
    if (!url) continue
    const dest = join(outDir, 'frames', `${s.shot_id}_${key}.png`)
    if (existsSync(dest)) { ok++; continue }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
      ok++
    } catch (e) {
      fail++
      console.error(`frame fail ${s.shot_id}_${key}: ${e.message}`)
    }
  }
}

console.log(JSON.stringify({
  project: proj?.title,
  shotCount: shots.length,
  withPreviz: shots.filter((s) => s.rough_storyboard?.frames?.start).length,
  sceneCount: new Set(shots.map((s) => s.scene_id)).size,
  stateKeys: Object.keys(state),
  hasShotDesign: Array.isArray(state.shotDesign) ? state.shotDesign.length : !!state.shotDesign,
  frames: { ok, miss, fail },
}, null, 2))
