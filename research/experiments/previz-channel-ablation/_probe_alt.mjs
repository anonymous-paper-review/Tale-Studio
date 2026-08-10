import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const PID='9d6efa6d-3216-40b0-8a2c-184ab56f02ec'
const ALT=['sh_01_09','sh_02_14','sh_09_69','sh_04_27','sh_01_05']
const { data: shots } = await db.from('shots').select('shot_id,action_description,rough_storyboard,storyboard_image,characters,duration_seconds').eq('project_id',PID).in('shot_id',ALT)
mkdirSync('run/frames',{recursive:true})
for (const s of shots) {
  const r=s.rough_storyboard?.frames, R=s.storyboard_image?.frames
  console.log(`${s.shot_id} dur=${s.duration_seconds} chars=${JSON.stringify(s.characters)} rough=${!!r?.direction} real=${!!R?.end} :: ${s.action_description}`)
  for (const [k,u] of Object.entries({rough_start:r?.start,rough_direction:r?.direction,rough_end:r?.end,real_start:R?.start,real_direction:R?.direction,real_end:R?.end})) {
    if(!u) continue
    const dest=join('run/frames',`${s.shot_id}__${k}.png`)
    if(existsSync(dest)) continue
    const res=await fetch(u); writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  }
}
