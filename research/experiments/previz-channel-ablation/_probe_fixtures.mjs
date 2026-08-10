import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const CANDS = [
  ['9d6efa6d-3216-40b0-8a2c-184ab56f02ec','Sample1'],
  ['011fd4bd-9b0a-46fe-b978-35677a4f6ee6','writer_test_260805_5'],
  ['a4a728df-a089-49ed-8598-af88cc990bd1','writer_test_260721'],
  ['c86410d7-2e48-4e02-956d-c415e8e7f03b','writer_test_260805_6'],
  ['6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a','Sample2'],
  ['f79546f6-77df-4331-8e31-0b425fc984a5','writer_test_260805_7viz'],
]
for (const [pid,name] of CANDS) {
  const { data: shots } = await db.from('shots').select('shot_id,dynamic_spec,movement_preset,characters,duration_seconds,check_notes,storyboard_image,rough_storyboard').eq('project_id',pid)
  const withDyn = shots.filter(s=>s.dynamic_spec)
  const both = shots.filter(s=>s.rough_storyboard?.frames?.direction && s.storyboard_image?.frames?.end)
  const withMove = shots.filter(s=>s.movement_preset)
  // character assets
  let chars = 'n/a'
  for (const t of ['characters','project_characters','assets']) {
    const { data, error } = await db.from(t).select('*').eq('project_id',pid).limit(50)
    if (!error) { chars = `${t}:${data.length}`; break }
  }
  console.log(`${name} (${pid.slice(0,8)}): shots=${shots.length} both=${both.length} dynSpec=${withDyn.length} movePreset=${withMove.length} ${chars}`)
}
