// 후보 조사 (읽기 전용) — START/END 변화가 큰 샷을 여러 시나리오에서 뽑고, 캐릭터·배경 자산의
//   다각도 뷰 보유 현황을 센다.
//   왜: 오너 지시 2026-08-11 — ① 끝 그림 유무 A/B 를 "다른 시나리오·다이나믹한 샷"에서 볼 것
//                              ② 캐릭터/배경 다각도 그림을 대신 넣는 팔이 가능한지
//   범위: SELECT + 이미지 다운로드(비교용). 쓰기 없음.
// 실행: pnpm dlx tsx research/experiments/previz-endframe-ab/probe.mts
import { config } from 'dotenv'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

const { supabaseAdmin } = await import('@/lib/supabase/admin')

const DIR = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(DIR, 'run'), { recursive: true })

type Row = Record<string, unknown>

const { data: projects, error: pErr } = await supabaseAdmin
  .from('projects')
  .select('id, title, style_anchor_key, created_at')
  .order('created_at', { ascending: false })
  .limit(40)
if (pErr) throw pErr

const out: Row = { projects: [] }
const projRows: Row[] = []

for (const p of projects ?? []) {
  const { count: shotCount } = await supabaseAdmin
    .from('shots')
    .select('shot_id', { count: 'exact', head: true })
    .eq('project_id', p.id as string)
  const { data: shots } = await supabaseAdmin
    .from('shots')
    .select('shot_id, scene_id, action_description, duration_seconds, storyboard_image, dynamic_spec, static_spec, characters, location_ids')
    .eq('project_id', p.id as string)
    .not('storyboard_image', 'is', null)
  const withFrames = (shots ?? []).filter((s) => {
    const f = (s.storyboard_image as { frames?: { start?: string; end?: string } } | null)?.frames
    return !!f?.start && !!f?.end
  })
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('project_id', p.id as string)
  projRows.push({
    id: p.id,
    title: p.title,
    style_anchor_key: p.style_anchor_key,
    shots_total: shotCount ?? 0,
    shots_with_start_end: withFrames.length,
    characters: (chars ?? []).length,
    character_columns: chars?.[0] ? Object.keys(chars[0]) : [],
    sample_shots: withFrames.slice(0, 200).map((s) => ({
      shot_id: s.shot_id,
      scene_id: s.scene_id,
      duration_seconds: s.duration_seconds,
      action: String(s.action_description ?? '').slice(0, 120),
      camera_motion: (s.dynamic_spec as { camera_motion?: unknown } | null)?.camera_motion ?? null,
      character_motion: (s.dynamic_spec as { character_motion?: unknown } | null)?.character_motion ?? null,
      start: (s.storyboard_image as { frames?: { start?: string } }).frames?.start,
      end: (s.storyboard_image as { frames?: { end?: string } }).frames?.end,
      characters: s.characters,
      location_ids: s.location_ids,
    })),
  })
}
out.projects = projRows

// 배경/월드 자산 테이블 존재 여부 — 이름 후보를 하나씩 두드려 본다(추측 금지, 실측)
const tableProbe: Row = {}
for (const t of ['worlds', 'locations', 'world_assets', 'location_assets', 'assets']) {
  const { error, count } = await supabaseAdmin.from(t).select('*', { count: 'exact', head: true })
  tableProbe[t] = error ? `없음/접근불가: ${error.message.slice(0, 80)}` : `있음 (${count}행)`
}
out.background_asset_tables = tableProbe

writeFileSync(join(DIR, 'run', 'probe.json'), JSON.stringify(out, null, 2))
console.log('OK → run/probe.json')
for (const r of projRows) {
  console.log(
    `${String(r.title).slice(0, 34).padEnd(36)} shots=${String(r.shots_total).padStart(3)} start+end=${String(r.shots_with_start_end).padStart(3)} chars=${r.characters}`,
  )
}
console.log('\n배경 자산 테이블:', JSON.stringify(tableProbe, null, 1))
console.log('캐릭터 컬럼:', JSON.stringify(projRows.find((r) => (r.character_columns as string[])?.length)?.character_columns ?? []))
