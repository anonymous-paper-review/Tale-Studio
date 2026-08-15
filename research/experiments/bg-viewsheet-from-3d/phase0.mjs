// Phase 0 — 대상 로케이션·후보 샷·각도 수요 확정 (read-only). 새 각도 목록 발명 금지 — DB에서 유도만.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: projs } = await db.from('projects').select('id,title')
const proj = projs.find((p) => p.id.startsWith('9d6efa6d'))
const { data: loc } = await db.from('locations').select('*').eq('project_id', proj.id).eq('location_id', 'location').maybeSingle()
const { data: scenes } = await db.from('scenes').select('*').eq('project_id', proj.id)
const { data: shots } = await db.from('shots').select('shot_id,scene_id,shot_type,static_spec,dynamic_spec,prompt,duration_seconds,storyboard_image').eq('project_id', proj.id)

const sceneCols = scenes?.[0] ? Object.keys(scenes[0]) : []
const locKey = sceneCols.find((c) => /location/i.test(c))
const courtScenes = (scenes ?? []).filter((s) => String(s[locKey] ?? '').includes('location') && !String(s[locKey]).includes('location_'))
const courtSceneIds = new Set(courtScenes.map((s) => s.scene_id))
const courtShots = (shots ?? []).filter((s) => courtSceneIds.has(s.scene_id))

const angleDemand = {}
const typeDemand = {}
for (const s of courtShots) {
  const a = s.static_spec?.camera_angle ?? '(없음)'
  angleDemand[a] = (angleDemand[a] ?? 0) + 1
  const t = s.static_spec?.shot_type ?? s.shot_type ?? '(없음)'
  typeDemand[t] = (typeDemand[t] ?? 0) + 1
}
// 공간을 훑는 샷 = 카메라가 움직이고, 타이트샷(CU/ECU)이 아닌 것(배경 수요 실측: 실수요는 wide+mid)
const sweeping = courtShots.filter((s) => {
  const cm = s.dynamic_spec?.camera_motion
  const t = String(s.static_spec?.shot_type ?? s.shot_type ?? '')
  return cm && cm.type && cm.type !== 'static' && !['CU', 'ECU'].includes(t)
})

const out = {
  ticket: 't2-bg-viewsheet-from-3d', date: '2026-08-12', phase: '0 — 좌표 확정(read-only)',
  project: { id: proj.id, title: proj.title },
  location: { location_id: loc?.location_id, name: loc?.name, wide_shot: loc?.wide_shot,
    visual_description: loc?.visual_description, props: loc?.props, lighting_sources: loc?.lighting_sources },
  scene_location_column: locKey,
  court_scenes: courtScenes.map((s) => ({ scene_id: s.scene_id, location: s[locKey], title: s.title ?? s.name ?? null })),
  shots_in_location: courtShots.length,
  angle_demand: angleDemand,
  shot_type_demand: typeDemand,
  sweeping_candidates: sweeping.map((s) => ({
    shot_id: s.shot_id, scene_id: s.scene_id, shot_type: s.static_spec?.shot_type ?? s.shot_type,
    camera_angle: s.static_spec?.camera_angle, motion: s.dynamic_spec?.camera_motion,
    duration: s.duration_seconds, has_start_frame: !!s.storyboard_image?.frames?.start,
    prompt_head: String(s.prompt ?? '').slice(0, 200),
  })),
}
writeFileSync(new URL('./phase0.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('프로젝트:', proj.title, '| 로케이션:', loc?.name, '| wide_shot:', loc?.wide_shot ? '있음' : '없음')
console.log('씬 로케이션 컬럼:', locKey, '| 해당 씬', courtScenes.length, '| 샷', courtShots.length)
console.log('각도 수요:', JSON.stringify(angleDemand))
console.log('샷타입 수요:', JSON.stringify(typeDemand))
console.log('훑는 샷 후보:', sweeping.length)
for (const s of out.sweeping_candidates.slice(0, 8)) console.log(`  ${s.shot_id} ${s.shot_type} angle=${s.camera_angle} motion=${s.motion?.type}/${s.motion?.direction} ${s.duration}s frame=${s.has_start_frame}`)
