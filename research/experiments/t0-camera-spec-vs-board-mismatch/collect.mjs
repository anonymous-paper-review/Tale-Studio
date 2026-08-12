// t0-camera-spec-vs-board-mismatch — 명세(횡이동)와 그림(축 방향 이동)이 어긋난 샷이 몇 건인가.
//   Phase A(이 스크립트, read-only): 대상 모집단 추출 + 판독 가능 여부 확정. 발주 없음.
//   판독(지각)은 별도 단계 — 여기서는 코드로 셀 수 있는 것만 센다(판정 3원칙).
// 실행: node research/experiments/t0-camera-spec-vs-board-mismatch/collect.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

const { data: runs } = await db.from('writer_runs').select('project_id').eq('status', 'completed')
const projectIds = [...new Set((runs ?? []).map((r) => r.project_id))]

const rows = []
for (const pid of projectIds) {
  const { data: shots } = await db
    .from('shots')
    .select('shot_id,dynamic_spec,storyboard_image,rough_storyboard,movement_preset,speed')
    .eq('project_id', pid)
  for (const s of shots ?? []) {
    const cm = s.dynamic_spec?.camera_motion
    if (!cm) continue
    const sb = s.storyboard_image
    const frames = sb?.frames ?? sb?.frame_urls ?? null
    const startUrl = frames?.start?.url ?? frames?.start ?? sb?.start_url ?? null
    const endUrl = frames?.end?.url ?? frames?.end ?? sb?.end_url ?? null
    rows.push({
      project_id: pid,
      shot_id: s.shot_id,
      motion_type: cm.type ?? null,
      direction: cm.direction ?? null,
      speed: cm.speed ?? null,
      magnitude: cm.magnitude ?? null,
      lateral_tracking: cm.type === 'tracking' && ['left_to_right', 'right_to_left'].includes(cm.direction),
      axial_spec: ['dolly_in', 'dolly_out'].includes(cm.type) || ['forward', 'backward'].includes(cm.direction),
      has_start_frame: !!startUrl,
      has_end_frame: !!endUrl,
      storyboard_keys: sb ? Object.keys(sb) : [],
      rough_url: s.rough_storyboard?.url ?? null,
    })
  }
}

const withSpec = rows.length
const lateral = rows.filter((r) => r.lateral_tracking)
const lateralReadable = lateral.filter((r) => r.has_start_frame && r.has_end_frame)
const motionDist = {}
for (const r of rows) motionDist[`${r.motion_type}/${r.direction ?? '-'}`] = (motionDist[`${r.motion_type}/${r.direction ?? '-'}`] ?? 0) + 1

const out = {
  ticket: 't0-camera-spec-vs-board-mismatch',
  date: '2026-08-12',
  phase: 'A — 모집단 추출(코드만). 판독 대상이 없으면 여기서 종료.',
  projects: projectIds.length,
  shots_with_camera_motion: withSpec,
  motion_distribution: motionDist,
  lateral_tracking_shots: lateral.length,
  lateral_with_both_frames: lateralReadable.length,
  shots_with_any_storyboard_frames: rows.filter((r) => r.has_start_frame || r.has_end_frame).length,
  storyboard_key_shapes: [...new Set(rows.map((r) => r.storyboard_keys.join('|')))].slice(0, 10),
  lateral_rows: lateral,
  rows,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`완료 프로젝트 ${projectIds.length} | camera_motion 보유 샷 ${withSpec}`)
console.log('움직임 분포:', JSON.stringify(motionDist))
console.log(`횡이동(tracking+좌우) 샷 ${lateral.length} | 그중 시작·끝 그림 둘 다 있는 샷 ${lateralReadable.length}`)
console.log('storyboard_image 키 형상:', JSON.stringify(out.storyboard_key_shapes))
