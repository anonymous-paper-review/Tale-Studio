// 픽스처 후보 서베이 — 러프 3프레임 + 리얼 스트립 프레임이 둘 다 있는 샷을 가진 프로젝트를 찾는다.
//   usage: node research/experiments/previz-channel-ablation/survey.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const { data: projects, error } = await db.from('projects').select('id,title,created_at').order('created_at', { ascending: false }).limit(60)
if (error) throw error
const rows = []
for (const p of projects) {
  const { data: shots } = await db.from('shots').select('shot_id,rough_storyboard,storyboard_image').eq('project_id', p.id)
  if (!shots?.length) continue
  const roughFull = shots.filter((s) => s.rough_storyboard?.frames?.start && s.rough_storyboard?.frames?.direction && s.rough_storyboard?.frames?.end)
  const realFull = shots.filter((s) => s.storyboard_image?.frames?.start && s.storyboard_image?.frames?.end)
  const both = shots.filter((s) => s.rough_storyboard?.frames?.start && s.rough_storyboard?.frames?.direction && s.rough_storyboard?.frames?.end && s.storyboard_image?.frames?.start && s.storyboard_image?.frames?.end)
  if (roughFull.length || realFull.length) rows.push({ id: p.id, title: p.title, shots: shots.length, roughFull: roughFull.length, realFull: realFull.length, both: both.length })
}
rows.sort((a, b) => b.both - a.both || b.roughFull - a.roughFull)
console.log(JSON.stringify(rows, null, 2))
