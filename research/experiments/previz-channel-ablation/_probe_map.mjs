import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const PID='9d6efa6d-3216-40b0-8a2c-184ab56f02ec'
const PICKS=['sh_02_10','sh_02_11','sh_01_02','sh_01_06','sh_07_57']
const { data: shots } = await db.from('shots').select('shot_id,characters,location_ids,action_description,duration_seconds,prompt,check_notes,generation_method,camera_brand,focal_length,aperture,white_balance,movement_preset,camera_config,sort_order,scene_id').eq('project_id',PID).in('shot_id',PICKS)
const { data: chars } = await db.from('characters').select('id,character_id,name,view_main,portrait').eq('project_id',PID)
console.log('=== character_id map ===')
for(const c of chars) console.log(` ${c.character_id} -> ${c.name} (uuid ${c.id.slice(0,8)}) view_main=${c.view_main?'Y':'N'} portrait=${c.portrait?'Y':'N'}`)
console.log('\n=== picked shots ===')
for(const s of shots) console.log(JSON.stringify({shot_id:s.shot_id,scene:s.scene_id,sort:s.sort_order,chars:s.characters,loc:s.location_ids,dur:s.duration_seconds,gm:s.generation_method,mp:s.movement_preset,cam:s.camera_config,prompt:s.prompt,notes:(s.check_notes||[]).length,action:s.action_description}))
console.log('\n=== style anchor key=real ===')
const { data: sa } = await db.from('style_anchors').select('*').eq('key','real').maybeSingle()
console.log(JSON.stringify(sa))
console.log('\n=== worlds table? ===')
for (const t of ['worlds','locations']) { const {data,error}=await db.from(t).select('id,name').eq('project_id',PID).limit(5); console.log(t, error?('ERR '+error.message):JSON.stringify(data)) }
