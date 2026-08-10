import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}})
const { data } = await db.from('shots').select('*').eq('project_id','9d6efa6d-3216-40b0-8a2c-184ab56f02ec').limit(1)
console.log('COLUMNS:', Object.keys(data[0]).join(', '))
const r = {...data[0]}
for (const k of Object.keys(r)) { const v = JSON.stringify(r[k]); if (v && v.length>500) r[k] = v.slice(0,500)+'…' }
console.log(JSON.stringify(r,null,2))
