// t0-c3-transition-dist — live DB read-only: 완료 3프로젝트 v4 산출의 transition 분포.
//   Phase 0 확정: transition은 shots 컬럼에 없음 → writer_runs.state.shotDesign[].dynamic_spec.transition_{in,out}
//   (v4:485 산출층). writer_test_260810만 shots.dynamic_spec에도 중복 영속(신 persist 경로) — 교차 확인용.
//   usage: node research/experiments/t0-c3-transition-dist/collect.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

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

// G3와 같은 모집단(티켓 좌표): Sample1 · w260810(실제 title: writer_test_260810) · Upload_test
const TARGETS = [
  { name: 'Sample1', idPrefix: '9d6efa6d' },
  { name: 'writer_test_260810', idPrefix: 'e1a9fd08' },
  { name: 'Upload_test', idPrefix: '04926a0a' },
]

const { data: projs } = await db.from('projects').select('id, title')
const out = { phase0: 'writer_runs.state.shotDesign[].dynamic_spec.transition_{in,out} (shots 컬럼 부재 확인됨)', projects: [], grand: { in: {}, out: {} } }

for (const t of TARGETS) {
  const proj = projs.find((p) => p.id.startsWith(t.idPrefix))
  const { data: runs } = await db
    .from('writer_runs')
    .select('id, state, created_at')
    .eq('project_id', proj.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const sd = runs?.[0]?.state?.shotDesign
  if (!sd) {
    out.projects.push({ name: t.name, id: proj.id, note: 'state.shotDesign 부재' })
    continue
  }
  const items = Array.isArray(sd) ? sd : Object.values(sd)
  const dist = { in: {}, out: {} }
  for (const it of items) {
    const tin = it?.dynamic_spec?.transition_in ?? 'NULL'
    const tout = it?.dynamic_spec?.transition_out ?? 'NULL'
    dist.in[tin] = (dist.in[tin] ?? 0) + 1
    dist.out[tout] = (dist.out[tout] ?? 0) + 1
    out.grand.in[tin] = (out.grand.in[tin] ?? 0) + 1
    out.grand.out[tout] = (out.grand.out[tout] ?? 0) + 1
  }
  out.projects.push({ name: t.name, id: proj.id, run_id: runs[0].id, shots: items.length, dist })
}

// shots.dynamic_spec 교차 (w260810만 보유)
const w = projs.find((p) => p.id.startsWith('e1a9fd08'))
const { data: wShots } = await db.from('shots').select('shot_id, dynamic_spec').eq('project_id', w.id)
const cross = { in: {}, out: {} }
for (const s of wShots ?? []) {
  const tin = s.dynamic_spec?.transition_in ?? 'NULL'
  const tout = s.dynamic_spec?.transition_out ?? 'NULL'
  cross.in[tin] = (cross.in[tin] ?? 0) + 1
  cross.out[tout] = (cross.out[tout] ?? 0) + 1
}
out.cross_check_w260810_shots_table = { shots: wShots?.length ?? 0, dist: cross }

const totIn = Object.values(out.grand.in).reduce((a, b) => a + b, 0)
const totOut = Object.values(out.grand.out).reduce((a, b) => a + b, 0)
out.summary = {
  total_shots: totIn,
  cut_share_in: +(((out.grand.in['cut'] ?? 0) / totIn)).toFixed(4),
  cut_share_out: +(((out.grand.out['cut'] ?? 0) / totOut)).toFixed(4),
}

writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('summary:', JSON.stringify(out.summary))
console.log('grand.in:', JSON.stringify(out.grand.in))
console.log('grand.out:', JSON.stringify(out.grand.out))
for (const p of out.projects) console.log(p.name, p.shots, 'in:', JSON.stringify(p.dist?.in), 'out:', JSON.stringify(p.dist?.out))
console.log('cross(w260810 shots tbl):', JSON.stringify(out.cross_check_w260810_shots_table.dist))
