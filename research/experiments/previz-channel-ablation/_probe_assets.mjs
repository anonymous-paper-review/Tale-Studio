import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const PID='9d6efa6d-3216-40b0-8a2c-184ab56f02ec'
const { data: chars } = await db.from('characters').select('*').eq('project_id',PID)
console.log('=== characters ===')
for (const c of chars) console.log(c.id, '|', c.name, '| keys:', Object.keys(c).filter(k=>c[k]!=null).join(','))
console.log('\n=== sample char row ===')
const c0={...chars[0]}; for(const k of Object.keys(c0)){const v=JSON.stringify(c0[k]); if(v&&v.length>300)c0[k]=v.slice(0,300)+'…'}
console.log(JSON.stringify(c0,null,2))
console.log('\n=== style anchor tables ===')
for (const t of ['style_anchors','project_style_anchors']) {
  const { data, error } = await db.from(t).select('*').eq('project_id',PID).limit(5)
  console.log(t, error? 'ERR:'+error.message : JSON.stringify(data?.map(r=>({id:r.id,imageUrl:r.image_url??r.imageUrl,status:r.status}))))
}
const { data: proj } = await db.from('projects').select('*').eq('id',PID).single()
console.log('\n=== project keys w/ values ===', Object.keys(proj).filter(k=>proj[k]!=null).join(','))
console.log('style-ish:', JSON.stringify(Object.fromEntries(Object.entries(proj).filter(([k])=>/style|anchor|medium/i.test(k)))).slice(0,600))
