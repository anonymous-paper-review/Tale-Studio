// 커밋 이전(b964a35 직전 7일) 같은 스테이지들의 모델·소요시간 — 대조군. 읽기 전용.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const FROM = '2026-08-05T00:00:00Z', TO = '2026-08-12T06:08:59Z'
const out = {}
for (const stage of ['dramaturgy', 'narrativeStructure', 'scenes', 'structureScenesMerged']) {
  const { data, error } = await db.from('llm_calls')
    .select('provider, model, duration_ms, called_at').eq('stage', stage)
    .gte('called_at', FROM).lt('called_at', TO).order('called_at').limit(2000)
  if (error) throw new Error(error.message)
  const m = {}
  for (const r of data ?? []) {
    const k = `${r.provider}/${r.model}`
    m[k] = m[k] ?? { calls: 0, ds: [] }
    m[k].calls++; if (typeof r.duration_ms === 'number') m[k].ds.push(r.duration_ms)
  }
  for (const k of Object.keys(m)) { const d = m[k].ds.sort((a,b)=>a-b); m[k].median_ms = d.length ? d[Math.floor(d.length/2)] : null; m[k].max_ms = d.length ? d[d.length-1] : null; delete m[k].ds }
  out[stage] = { window: [FROM, TO], totalRows: (data ?? []).length, byModel: m }
}
writeFileSync(new URL('./db-before.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
