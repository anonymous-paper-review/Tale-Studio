import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const { data: shots } = await db.from('shots').select('shot_id,rough_storyboard,storyboard_image,duration_seconds,characters,action_description').eq('project_id','9d6efa6d-3216-40b0-8a2c-184ab56f02ec').in('shot_id',['sh_05_35','sh_01_05','sh_08_64','sh_07_56'])
for (const s of shots) {
  console.log(`${s.shot_id} dur=${s.duration_seconds} chars=${JSON.stringify(s.characters)}`)
  const r=s.rough_storyboard.frames, R=s.storyboard_image.frames
  for (const [k,u] of Object.entries({rough_start:r.start,rough_direction:r.direction,rough_end:r.end,real_start:R.start,real_direction:R.direction,real_end:R.end})) {
    const dest=join('run/frames',`${s.shot_id}__${k}.png`); if(existsSync(dest)||!u) continue
    const res=await fetch(u); writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  }
}
