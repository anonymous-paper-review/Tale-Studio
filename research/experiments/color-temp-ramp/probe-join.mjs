// shots ↔ scenes 실제 연결 방식 확인. 읽기 전용.
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

const { data: sh } = await db
  .from('shots')
  .select('id, project_id, scene_id, shot_id, sort_order')
  .limit(8)
console.log('=== shots 샘플 ===')
console.log(JSON.stringify(sh, null, 2))

const { data: sc } = await db.from('scenes').select('id, project_id, scene_id, sort_order').limit(8)
console.log('\n=== scenes 샘플 ===')
console.log(JSON.stringify(sc, null, 2))

// shots.scene_id 고유값 개수
const { data: allSh } = await db.from('shots').select('scene_id').limit(2000)
const uniq = new Set(allSh.map((r) => r.scene_id))
console.log('\nshots.scene_id 고유값 개수:', uniq.size)
console.log('샘플 20개:', [...uniq].slice(0, 20).join(', '))

const { data: allSc } = await db.from('scenes').select('scene_id, id').limit(2000)
console.log('\nscenes.scene_id 고유값 개수:', new Set(allSc.map((r) => r.scene_id)).size)
console.log('샘플 20개:', [...new Set(allSc.map((r) => r.scene_id))].slice(0, 20).join(', '))
console.log('scenes.id 가 UUID 형태인가:', /^[0-9a-f-]{36}$/.test(String(allSc[0]?.id)))
