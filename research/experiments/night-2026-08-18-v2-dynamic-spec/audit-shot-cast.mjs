// 읽기 전용 감사: shots.characters 에 그 프로젝트 인물 명단 밖 id 가 있는가.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('/Users/xcape/projects/tale-studio/.env.local', 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

async function all(table, cols) {
  let from = 0, size = 1000, out = []
  for (;;) {
    const { data, error } = await db.from(table).select(cols).range(from, from + size - 1)
    if (error) { console.error('ERR', table, error.message); process.exit(1) }
    if (!data?.length) break
    out.push(...data)
    if (data.length < size) break
    from += size
  }
  return out
}

const chars = await all('characters', 'id,project_id,name,character_id')
const shots = await all('shots', 'shot_id,project_id,characters,created_at')

// 프로젝트별 유효 인물 식별자 집합 (id, character_id, name 전부 허용)
const byProject = new Map()
for (const c of chars) {
  if (!byProject.has(c.project_id)) byProject.set(c.project_id, new Set())
  const s = byProject.get(c.project_id)
  for (const v of [c.id, c.character_id, c.name]) if (v) s.add(String(v))
}

const tally = { shots: shots.length, with_cast: 0, clean: 0, dirty: 0, projects_dirty: new Set() }
const bad = []
for (const s of shots) {
  const list = Array.isArray(s.characters) ? s.characters : []
  if (!list.length) continue
  tally.with_cast++
  const valid = byProject.get(s.project_id) ?? new Set()
  const miss = list.filter((x) => x && !valid.has(String(x)))
  if (miss.length) {
    tally.dirty++
    tally.projects_dirty.add(s.project_id)
    if (bad.length < 12) bad.push({ shot_id: s.shot_id, project_id: s.project_id, missing: miss, all: list, created_at: s.created_at })
  } else tally.clean++
}
console.log(JSON.stringify({
  tally: { ...tally, projects_dirty: [...tally.projects_dirty] },
  sample_bad: bad,
}, null, 2))
