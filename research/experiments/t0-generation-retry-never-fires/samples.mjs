// t0-generation-retry-never-fires — 실패 원인 분류별 실제 오류 문구 표본 (읽기 전용).
//   result.md 에 원문 그대로 인용하기 위한 채집. 분류당 최대 2건, 문구는 200자로 자른다.
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
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data, error } = await db
  .from('generation_jobs')
  .select('id, kind, error_class, error, attempts, created_at')
  .eq('status', 'failed')
  .order('created_at', { ascending: true })
if (error) throw error

const byClass = {}
for (const r of data) {
  const c = r.error_class ?? '(null)'
  byClass[c] = byClass[c] ?? []
  if (byClass[c].length < 2) {
    byClass[c].push({
      id: r.id,
      kind: r.kind,
      attempts: r.attempts,
      created_at: r.created_at,
      error: String(r.error ?? '').slice(0, 200),
    })
  }
}

writeFileSync(new URL('./error-samples.json', import.meta.url), JSON.stringify(byClass, null, 2))
console.log(JSON.stringify(byClass, null, 2))
