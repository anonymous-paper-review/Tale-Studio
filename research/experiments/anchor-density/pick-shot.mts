import { config } from 'dotenv'
config({ path: '.env.local' })
const { supabaseAdmin } = await import('@/lib/supabase/admin')
const { loadShotDesignByMainId, resolveShotDesign } = await import('@/lib/writer/shot-design-state')
const PID = '011fd4bd-9b0a-46fe-b978-35677a4f6ee6'

const { data: shots } = await supabaseAdmin
  .from('shots').select('shot_id, design_ref, shot_type, duration_seconds, action_description, storyboard_image, dynamic_spec, static_spec, sort_order')
  .eq('project_id', PID).order('sort_order', { ascending: true })
const list = (shots ?? []) as Array<Record<string, any>>
const byId = await loadShotDesignByMainId(PID)
const usesRefs = list.some((s) => s.design_ref != null)
console.log(`샷 ${list.length} · 설계 뭉치 ${byId.size} · design_ref 체계 ${usesRefs}`)

const cands: Array<Record<string, any>> = []
for (const s of list) {
  const fr = (s.storyboard_image as any)?.frames ?? {}
  if (!fr.start || !fr.end) continue
  let dyn = s.dynamic_spec
  let via = 'row'
  if (!dyn) {
    const r = resolveShotDesign(byId, { shotId: s.shot_id, designRef: s.design_ref }, usesRefs) as any
    dyn = r?.dynamicSpec ?? null
    via = dyn ? 'fallback' : 'none'
  }
  const cm = dyn?.camera_motion
  const chm = (dyn?.character_motion ?? []).map((m: any) => `${m.verb}(${m.magnitude})`).join(',')
  const moving = Boolean(cm?.type && cm.type !== 'static')
  cands.push({ id: s.shot_id, type: s.shot_type, dur: s.duration_seconds, via, moving,
    cam: cm ? `${cm.type}/${cm.direction}/${cm.speed}/${cm.magnitude}` : '—', chm,
    act: String(s.action_description ?? '').slice(0, 95), start: fr.start, end: fr.end })
}
const mv = cands.filter((c) => c.moving)
console.log(`\nstart+end 보유 ${cands.length} · 그중 카메라 움직임 ${mv.length}`)
console.log('\n=== 움직임 있는 샷 ===')
for (const c of mv) console.log(`[${c.id}] ${c.type} ${c.dur}s (${c.via}) ${c.cam}\n   인물: ${c.chm || '—'}\n   ${c.act}`)
console.log('\n=== 인물 움직임 큰 정지 샷 (차선) ===')
for (const c of cands.filter((c) => !c.moving && /large|moderate/.test(c.chm)).slice(0, 6))
  console.log(`[${c.id}] ${c.type} ${c.dur}s (${c.via}) 인물: ${c.chm}\n   ${c.act}`)
const pick = mv.sort((a, b) => b.dur - a.dur)[0] ?? cands.filter((c)=>/large/.test(c.chm)).sort((a,b)=>b.dur-a.dur)[0]
if (pick) console.log(`\n>>> 추천: ${pick.id} (${pick.dur}s)\n START ${pick.start}\n END   ${pick.end}`)
