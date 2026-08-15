import { config } from 'dotenv'
config({ path: '.env.local' })
const { supabaseAdmin } = await import('@/lib/supabase/admin')
const { loadShotDesignByMainId, resolveShotDesign } = await import('@/lib/writer/shot-design-state')
const PID = '011fd4bd-9b0a-46fe-b978-35677a4f6ee6'
const { data: s } = await supabaseAdmin.from('shots')
  .select('shot_id,scene_id,shot_type,duration_seconds,action_description,storyboard_image,dynamic_spec,design_ref,camera_config')
  .eq('project_id', PID).eq('shot_id', 'sh_04_28').maybeSingle()
if (!s) { console.log('없음'); process.exit(1) }
const byId = await loadShotDesignByMainId(PID)
const dyn = (s.dynamic_spec as any) ?? (resolveShotDesign(byId, { shotId: 'sh_04_28', designRef: s.design_ref as any }, true) as any)?.dynamicSpec
const fr = (s.storyboard_image as any)?.frames ?? {}
console.log(`[${s.shot_id}] 씬 ${s.scene_id} · ${s.shot_type} · ${s.duration_seconds}초`)
console.log('액션:', s.action_description)
console.log('카메라:', JSON.stringify(dyn?.camera_motion ?? null))
console.log('인물:', JSON.stringify((dyn?.character_motion ?? []).map((m:any)=>`${m.verb}(${m.magnitude})`)))
console.log('계약 출처:', s.dynamic_spec ? '샷 기록' : '예비 경로')
console.log('프레임:', Object.keys(fr).join(', '))
for (const [k,v] of Object.entries(fr)) {
  const r = await fetch(v as string, { headers: { Range: 'bytes=0-2047' } })
  const b = Buffer.from(await r.arrayBuffer())
  const dim = b.slice(0,8).toString('hex')==='89504e470d0a1a0a' ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : '?'
  console.log(`  ${k}: ${dim}`)
}
