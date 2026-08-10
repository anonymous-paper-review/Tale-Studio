import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const PID='9d6efa6d-3216-40b0-8a2c-184ab56f02ec'
const { data: shots } = await db.from('shots').select('shot_id,scene_id,shot_type,action_description,duration_seconds,characters,static_spec,design_ref,storyboard_image,rough_storyboard,sort_order').eq('project_id',PID).order('sort_order')
const usable = shots.filter(s=>s.rough_storyboard?.frames?.direction && s.storyboard_image?.frames?.start && s.storyboard_image?.frames?.end)
console.log(`usable=${usable.length}`)
// design_ref 중복 = 분할 흔적
const byRef={}; for(const s of usable){ (byRef[s.design_ref] ||= []).push(s.shot_id) }
const dupes=Object.entries(byRef).filter(([,v])=>v.length>1)
console.log('design_ref 중복(분할 흔적):', JSON.stringify(dupes))
for (const s of usable) {
  const cam = s.static_spec?.camera_move ?? s.static_spec?.camera_movement ?? s.static_spec?.movement ?? null
  console.log(`${s.shot_id}\t${s.shot_type}\t${s.duration_seconds}s\tchars=${(s.characters||[]).length}\tdref=${s.design_ref}\tcam=${JSON.stringify(cam)}\t${(s.action_description||'').slice(0,150)}`)
}
