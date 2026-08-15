// shots.characters 충전율 — assets.characters 배선이 살아있는지의 대리 지표.
import { config } from 'dotenv'
config({ path: '.env.local' })
const { supabaseAdmin } = await import('@/lib/supabase/admin')
const { data: projects } = await supabaseAdmin.from('projects').select('id, title, updated_at').order('updated_at',{ascending:false}).limit(12)
for (const p of projects ?? []) {
  const { data: shots } = await supabaseAdmin.from('shots').select('shot_id, characters, location_ids').eq('project_id', p.id)
  const rows = shots ?? []
  if (!rows.length) continue
  const withChars = rows.filter(s => Array.isArray(s.characters) && (s.characters as string[]).length > 0).length
  console.log(`${p.title} | shots ${rows.length} | characters채워짐 ${withChars} | location_ids채워짐 ${rows.filter(s=>Array.isArray(s.location_ids)&&(s.location_ids as string[]).length>0).length}`)
}
