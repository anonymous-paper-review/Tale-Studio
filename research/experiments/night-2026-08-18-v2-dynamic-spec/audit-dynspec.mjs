// 읽기 전용 감사: shots.dynamic_spec 이 ShotDynamicSpec 계약 모양을 지키는가.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('/Users/xcape/projects/tale-studio/.env.local', 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

let from = 0, size = 1000
const tally = { total: 0, null_spec: 0, cam_object: 0, cam_string: 0, cam_other: 0, char_array: 0, char_string: 0, char_other: 0, both_bad: 0 }
const samples = []
for (;;) {
  const { data, error } = await db.from('shots').select('shot_id,project_id,design_ref,dynamic_spec,created_at').range(from, from + size - 1)
  if (error) { console.error('ERR', error.message); process.exit(1) }
  if (!data?.length) break
  for (const row of data) {
    tally.total++
    const d = row.dynamic_spec
    if (d == null) { tally.null_spec++; continue }
    const cm = d.camera_motion, chm = d.character_motion
    if (cm && typeof cm === 'object' && !Array.isArray(cm)) tally.cam_object++
    else if (typeof cm === 'string') tally.cam_string++
    else tally.cam_other++
    if (Array.isArray(chm)) tally.char_array++
    else if (typeof chm === 'string') tally.char_string++
    else tally.char_other++
    if (typeof cm === 'string' && typeof chm === 'string') {
      tally.both_bad++
      if (samples.length < 5) samples.push({ shot_id: row.shot_id, project_id: row.project_id, design_ref: row.design_ref, camera_motion: cm, character_motion: chm, created_at: row.created_at })
    }
  }
  if (data.length < size) break
  from += size
}
console.log(JSON.stringify({ tally, samples }, null, 2))
