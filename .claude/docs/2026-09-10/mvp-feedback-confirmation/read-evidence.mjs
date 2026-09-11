// 제보한 한 프로젝트의 입력·호출 기록·현재 모습만 읽는다. 원문 전체나 자격 증명은 출력하지 않는다.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const env = dotenv.parse(readFileSync('.env.local'))
if (new URL(env.SUPABASE_LIVE_URL).hostname !== 'qnjnrihfpqkdhjuzvepy.supabase.co') throw new Error('Reported live project mismatch')
const db = createClient(env.SUPABASE_LIVE_URL, env.SUPABASE_LIVE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const pid = '7112d31e-70ce-4743-9562-057f7beac002'
const out = '.claude/docs/2026-09-10/mvp-feedback-confirmation'
const terms = ['vending_machine_corner', 'char2']
function matches(value, path = '') {
  if (typeof value === 'string') {
    return terms.flatMap(term => {
      const pos = value.indexOf(term)
      return pos < 0 ? [] : [{ path, term, excerpt: value.slice(Math.max(0, pos-80), pos+term.length+130), chars: value.length }]
    })
  }
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k,v]) => matches(v, path ? `${path}.${k}` : k))
  return []
}
const requests = {
  project: db.from('projects').select('id,title,created_at,updated_at,story_text,expanded_story,producer_draft').eq('id', pid),
  calls: db.from('llm_calls').select('id,called_at,stage,provider,model,seq,run_id').eq('project_id', pid).order('called_at').limit(500),
  runs: db.from('writer_runs').select('id,created_at,updated_at,state').eq('project_id', pid).order('created_at').limit(20),
  characters: db.from('characters').select('character_id,name,appearance,appearance_native').eq('project_id', pid),
  characterAppearances: db.from('character_appearances').select('character_id,appearance_key,label,narrative_time,is_default,appearance,appearance_native,sheet_url,portrait_url,created_at,updated_at').eq('project_id', pid).order('created_at'),
  locations: db.from('locations').select('location_id,name,visual_description,visual_description_native,wide_shot').eq('project_id', pid),
  locationAppearances: db.from('location_appearances').select('location_id,appearance_key,label,narrative_time,visual_description,visual_description_native,wide_shot,created_at,updated_at').eq('project_id', pid).order('created_at'),
}
const results = await Promise.all(Object.entries(requests).map(async ([key,q]) => {
  const r = await q
  if (r.error) return [key, { error: r.error.message }]
  if (key === 'project') return [key,r.data.map(p=>({id:p.id,title:p.title,created_at:p.created_at,updated_at:p.updated_at,fields:Object.fromEntries(['story_text','expanded_story','producer_draft'].map(k=>[k,{chars:JSON.stringify(p[k])?.length,sha256:createHash('sha256').update(JSON.stringify(p[k])).digest('hex'),matches:matches(p[k],k)}]))}))]
  if (key === 'runs') return [key,r.data.map(p=>({id:p.id,created_at:p.created_at,updated_at:p.updated_at,stateKeys:Object.keys(p.state??{}),matches:matches(p.state)}))]
  return [key, r.data]
}))
const result = Object.fromEntries(results)
writeFileSync(`${out}/source-and-appearance-evidence.json`, JSON.stringify(result,null,2))
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k,v])=>[k,Array.isArray(v)?{count:v.length,...(['project','runs'].includes(k)?{rows:v}: {})}:v])),null,2))
