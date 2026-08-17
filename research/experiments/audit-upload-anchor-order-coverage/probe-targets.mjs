// 후속 조회 — 주문별 target 과 input_snapshot 키 목록(어느 통로가 만들었는지 지문).
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

const { data, error } = await db
  .from('generation_jobs')
  .select('id, kind, status, created_at, actor, model, input_snapshot, target')
  .eq('project_id', 'a003a8c6-82a1-4b6a-95d6-889a1f57ee08')
  .order('created_at', { ascending: true })
if (error) throw error

const rows = data.map((j) => ({
  created_at: j.created_at,
  kind: j.kind,
  actor: j.actor,
  model: j.model,
  target: j.target,
  snapshot_keys: Object.keys(j.input_snapshot ?? {}).sort(),
  style_anchor_key: j.input_snapshot?.style_anchor_key ?? null,
  prompt_head: typeof j.input_snapshot?.prompt === 'string' ? j.input_snapshot.prompt.slice(0, 90).replace(/\n/g, ' ⏎ ') : null,
}))
writeFileSync(new URL('./raw-targets.json', import.meta.url), JSON.stringify(rows, null, 2))
for (const r of rows) {
  console.log(`${r.created_at.slice(0, 19)} | ${r.kind.padEnd(21)} | ${r.actor.padEnd(6)} | anchorKey=${r.style_anchor_key ?? 'null'}`)
  console.log(`   target: ${JSON.stringify(r.target)}`)
  console.log(`   snapKeys: ${r.snapshot_keys.join(',')}`)
  console.log(`   prompt: ${r.prompt_head}`)
}
