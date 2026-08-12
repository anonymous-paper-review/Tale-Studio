import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: runs } = await db.from('writer_runs').select('id,project_id,created_at,state').gte('created_at', '2026-08-10T09:29:51.000Z').order('created_at')
for (const r of runs ?? []) {
  const st: any = r.state ?? {}
  const shots = st.shotSequence?.shots ?? []
  console.log('run', r.id.slice(0,8), 'proj', r.project_id.slice(0,8), 'stateShotIds:', shots.slice(0,4).map((s:any)=>`${s.shot_id}<-${s.source_shot_id}`).join(' '))
  const { data: ds } = await db.from('shots').select('shot_id,updated_at,created_at').eq('project_id', r.project_id).order('sort_order').limit(4)
  console.log('   dbShotIds:', (ds??[]).map((d:any)=>`${d.shot_id}@${String(d.updated_at).slice(0,19)}`).join(' '))
  const { data: proj } = await db.from('projects').select('title,created_at').eq('id', r.project_id).single()
  console.log('   proj:', proj?.title, proj?.created_at)
}
