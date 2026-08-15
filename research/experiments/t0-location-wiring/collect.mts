// 로케이션 배선 실측 — locations 행은 생기는가, shots.location_ids 는 누가 채우는가,
// 소비 경로(scenes.location → locations.location_id 조인)는 실제로 맞물리는가.
//
// 왜: persist_manifest.ts 는 shots insert 시 location_ids 를 컬럼에 넣지 않는다(640-693행).
//   SHOT_USER_CARRY_FORWARD_COLUMNS(382행)에만 있어 "기존 행에 값이 있으면 보존"뿐이다.
//   한편 소비측(use-writer-director-sync.ts:307-316)은 location_ids 를 아예 안 읽고
//   scene.location 문자열로 월드 에셋을 찾는다. 그 조인이 실제로 성립하는지를 센다.
//
// 범위: SELECT 만. 쓰기 없음. 생성 발주 없음. 이미지·영상 열람 없음(픽셀 해석 금지 대전제).
// 실행: pnpm dlx tsx research/experiments/t0-location-wiring/collect.mts
import { config } from 'dotenv'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

// 정적 import 는 dotenv 보다 먼저 평가돼 admin 클라이언트가 빈 URL 로 생성된다 → 동적 import.
const { supabaseAdmin } = await import('@/lib/supabase/admin')

const DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_LIMIT = Number(process.env.PROJECT_LIMIT ?? 12)

const { data: projects, error: projErr } = await supabaseAdmin
  .from('projects')
  .select('id, title, created_at, updated_at')
  .order('updated_at', { ascending: false })
  .limit(PROJECT_LIMIT)

if (projErr) throw new Error(`projects 조회 실패: ${projErr.message}`)

type Row = Record<string, unknown>
const rows: Row[] = []

for (const p of projects ?? []) {
  const [{ data: shots, error: shotErr }, { data: locs, error: locErr }, { data: scenes, error: sceneErr }] =
    await Promise.all([
      supabaseAdmin
        .from('shots')
        .select('shot_id, scene_id, location_ids, storyboard_image, prompt')
        .eq('project_id', p.id),
      supabaseAdmin
        .from('locations')
        .select('location_id, name, origin, wide_shot, establishing_shot, visual_description, scene_id, user_edited')
        .eq('project_id', p.id),
      supabaseAdmin
        .from('scenes')
        .select('scene_id, location, sort_order')
        .eq('project_id', p.id),
    ])

  if (shotErr || locErr || sceneErr) {
    rows.push({
      project_id: p.id,
      title: p.title,
      error: [shotErr?.message, locErr?.message, sceneErr?.message].filter(Boolean).join(' | '),
    })
    continue
  }

  const shotRows = shots ?? []
  const locRows = locs ?? []
  const sceneRows = scenes ?? []

  const locIdSet = new Set(locRows.map((l) => l.location_id as string))

  const withLocIds = shotRows.filter((s) => Array.isArray(s.location_ids) && (s.location_ids as string[]).length > 0)
  const nullLocIds = shotRows.filter((s) => s.location_ids === null)
  const emptyArrLocIds = shotRows.filter((s) => Array.isArray(s.location_ids) && (s.location_ids as string[]).length === 0)

  // 소비 경로 조인 검사: scenes.location 문자열이 locations.location_id 와 맞는가.
  const sceneLocValues = sceneRows.map((s) => (s.location as string | null) ?? '')
  const sceneLocNonEmpty = sceneLocValues.filter((v) => v.trim().length > 0)
  const sceneLocMatched = sceneLocNonEmpty.filter((v) => locIdSet.has(v))
  const sceneLocUnmatchedSample = [...new Set(sceneLocNonEmpty.filter((v) => !locIdSet.has(v)))].slice(0, 6)

  const locsWithWide = locRows.filter((l) => !!l.wide_shot)
  const locsWithEst = locRows.filter((l) => !!l.establishing_shot)

  rows.push({
    project_id: p.id,
    title: p.title,
    updated_at: p.updated_at,
    created_at: p.created_at,
    shots_total: shotRows.length,
    shots_location_ids_filled: withLocIds.length,
    shots_location_ids_null: nullLocIds.length,
    shots_location_ids_empty_array: emptyArrLocIds.length,
    locations_total: locRows.length,
    locations_origin: locRows.reduce<Record<string, number>>((acc, l) => {
      const o = (l.origin as string) ?? '(null)'
      acc[o] = (acc[o] ?? 0) + 1
      return acc
    }, {}),
    locations_with_wide_shot: locsWithWide.length,
    locations_with_establishing_shot: locsWithEst.length,
    location_ids_sample: locRows.slice(0, 8).map((l) => l.location_id),
    location_names_sample: locRows.slice(0, 8).map((l) => l.name),
    scenes_total: sceneRows.length,
    scenes_location_nonempty: sceneLocNonEmpty.length,
    scenes_location_matched_to_locations: sceneLocMatched.length,
    scenes_location_unmatched_sample: sceneLocUnmatchedSample,
    scenes_location_values_sample: [...new Set(sceneLocValues)].slice(0, 8),
  })
}

// 전역 집계
type Totals = {
  shots: number
  shotsFilled: number
  locations: number
  locWide: number
  scenes: number
  sceneLocNonEmpty: number
  sceneLocMatched: number
}

const totals = rows.reduce<Totals>(
  (acc, r) => {
    if (r.error) return acc
    acc.shots += (r.shots_total as number) ?? 0
    acc.shotsFilled += (r.shots_location_ids_filled as number) ?? 0
    acc.locations += (r.locations_total as number) ?? 0
    acc.locWide += (r.locations_with_wide_shot as number) ?? 0
    acc.scenes += (r.scenes_total as number) ?? 0
    acc.sceneLocNonEmpty += (r.scenes_location_nonempty as number) ?? 0
    acc.sceneLocMatched += (r.scenes_location_matched_to_locations as number) ?? 0
    return acc
  },
  { shots: 0, shotsFilled: 0, locations: 0, locWide: 0, scenes: 0, sceneLocNonEmpty: 0, sceneLocMatched: 0 },
)

// 전체 테이블 규모(프로젝트 제한 없이) — location_ids 가 하나라도 찬 행이 DB 전체에 있는지.
const { count: allShots } = await supabaseAdmin.from('shots').select('*', { count: 'exact', head: true })
const { count: allLocations } = await supabaseAdmin.from('locations').select('*', { count: 'exact', head: true })
const { data: anyFilled } = await supabaseAdmin
  .from('shots')
  .select('project_id, shot_id, location_ids, created_at')
  .not('location_ids', 'is', null)
  .limit(20)

const out = {
  generated_at: new Date().toISOString(),
  project_limit: PROJECT_LIMIT,
  totals,
  db_wide: {
    shots_rows: allShots,
    locations_rows: allLocations,
    shots_with_non_null_location_ids_sample: anyFilled ?? [],
    shots_with_non_null_location_ids_sample_count: (anyFilled ?? []).length,
  },
  projects: rows,
}

mkdirSync(DIR, { recursive: true })
writeFileSync(`${DIR}/result.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
