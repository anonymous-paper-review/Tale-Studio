// previz 채널 ablation — 픽스처 동결기 (읽기 전용).
//   live DB 에서 사전 등록된 5샷의 러프/리얼 프레임 + 캐릭터/스타일 참조를 fixtures.json 으로 동결하고
//   프레임 실물을 내려받는다. 이후 모든 단계는 DB 를 다시 보지 않는다 (재현성 규칙 2: 입력 고정).
//   usage: node research/experiments/previz-channel-ablation/collect.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const RUN = join(DIR, 'run')
const FRAMES = join(RUN, 'frames')

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ── 사전 등록 픽스처 (HYPOTHESIS 측정: 정지1·단일동작2·2동작1·카메라무빙1) ──
const PROJECT_ID = '9d6efa6d-3216-40b0-8a2c-184ab56f02ec' // Sample1
// 선정 근거는 러프 DIRECTION 패널 실물 판독(label_scan.json + 육안). 액션 텍스트가 아니라
// **러프 previz 가 실제로 무엇을 주문했는가**로 골랐다 — A1/A2 가 재는 것이 러프→리페인트,
// 리얼 START→END 이기 때문. 텍스트만 보고 고르면 previz 가 그 클래스를 아예 안 담은 샷이 섞인다
// (실제 탈락 사례: sh_07_57 은 액션이 "camera moves toward the bench" 인데 러프 라벨은 "STATIC HOLD",
//  sh_01_06 은 액션이 "hands tremble/drops documents" 인데 라벨은 "MUTTER (SMALL)" — 둘 다 기각).
const FIXTURES = [
  { shot_id: 'sh_02_10', klass: 'static', label: 'STATIC HOLD', why: '정지 대조군 — 인물 0, START≈END(팔 간 구분 불가가 정상)' },
  { shot_id: 'sh_01_02', klass: 'single', label: 'PULLS DRAWER', why: '단일 동작 + 강한 START→END 델타(서랍 닫힘→열림)' },
  { shot_id: 'sh_02_11', klass: 'single', label: 'BURSTS IN (LARGE) / TURNS', why: '단일 동작(문 박차고 진입) + 중간 델타' },
  { shot_id: 'sh_01_09', klass: 'double', label: 'TURNS', why: '2동작 순차("photographs ... then freezes") — shotCheck 분할 대상 형태' },
  { shot_id: 'sh_08_64', klass: 'camera', label: 'DOLLY IN (+SCROLLS, HEAD TURNS)', why: '카메라 무빙이 러프에 실제로 인코딩된 유일급 후보 — START→END 프레이밍이 실제로 좁혀진다' },
]

mkdirSync(FRAMES, { recursive: true })

const { data: project, error: pErr } = await db
  .from('projects')
  .select('id, title, workspace_id, style_anchor_key')
  .eq('id', PROJECT_ID)
  .single()
if (pErr) throw pErr

const { data: shots, error: sErr } = await db
  .from('shots')
  .select(
    'shot_id, scene_id, sort_order, shot_type, action_description, action_description_native, characters, location_ids, duration_seconds, generation_method, prompt, check_notes, dynamic_spec, static_spec, design_ref, camera_brand, focal_length, aperture, white_balance, movement_preset, camera_config, rough_storyboard, storyboard_image',
  )
  .eq('project_id', PROJECT_ID)
  .in('shot_id', FIXTURES.map((f) => f.shot_id))
if (sErr) throw sErr

const { data: chars, error: cErr } = await db
  .from('characters')
  .select('character_id, name, view_main, portrait')
  .eq('project_id', PROJECT_ID)
if (cErr) throw cErr
const charByKey = Object.fromEntries(chars.map((c) => [c.character_id, c]))

const { data: anchor, error: aErr } = await db
  .from('style_anchors')
  .select('key, image_url, is_active')
  .eq('key', project.style_anchor_key)
  .maybeSingle()
if (aErr) throw aErr

// ── 이전 샷 pull (라우트의 continuityLine 과 동일한 진실을 동결) ──
const prevBySort = {}
for (const s of shots) {
  if (typeof s.sort_order !== 'number' || s.sort_order <= 0) continue
  const { data: prev } = await db
    .from('shots')
    .select('scene_id, prompt, action_description')
    .eq('project_id', PROJECT_ID)
    .eq('sort_order', s.sort_order - 1)
    .maybeSingle()
  prevBySort[s.shot_id] = prev ?? null
}

async function dl(url, dest) {
  if (existsSync(dest)) return 'cached'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 90)}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return 'ok'
}

const out = []
for (const fx of FIXTURES) {
  const s = shots.find((x) => x.shot_id === fx.shot_id)
  if (!s) throw new Error(`fixture shot missing in DB: ${fx.shot_id}`)
  const rough = s.rough_storyboard?.frames
  const real = s.storyboard_image?.frames
  if (!rough?.start || !rough?.direction || !rough?.end)
    throw new Error(`rough frames incomplete: ${fx.shot_id}`)
  if (!real?.start || !real?.end) throw new Error(`real frames incomplete: ${fx.shot_id}`)

  for (const [k, u] of Object.entries({
    rough_start: rough.start,
    rough_direction: rough.direction,
    rough_end: rough.end,
    real_start: real.start,
    real_direction: real.direction,
    real_end: real.end,
  })) {
    if (!u) continue
    await dl(u, join(FRAMES, `${fx.shot_id}__${k}.png`))
  }

  // 제품과 동일한 캐릭터 참조 해석: characters[] → view_main ?? portrait (worlds 는 location_ids 없음 → 공집합)
  const charRefs = (s.characters ?? [])
    .map((id) => charByKey[id])
    .filter(Boolean)
    .map((c) => c.view_main ?? c.portrait)
    .filter(Boolean)

  out.push({
    ...fx,
    shot: s,
    prevShot: prevBySort[fx.shot_id] ?? null,
    charRefs,
    charNames: (s.characters ?? []).map((id) => charByKey[id]?.name ?? `?${id}`),
    roughFrames: rough,
    realFrames: real,
  })
}

const fixtures = {
  collectedAt: new Date().toISOString(),
  project: { id: project.id, title: project.title, workspace_id: project.workspace_id, style_anchor_key: project.style_anchor_key },
  styleAnchor: anchor && anchor.is_active !== false ? { key: anchor.key, imageUrl: anchor.image_url } : null,
  fixtures: out,
}
writeFileSync(join(RUN, 'fixtures.json'), JSON.stringify(fixtures, null, 2))

console.log(
  JSON.stringify(
    {
      project: project.title,
      styleAnchor: fixtures.styleAnchor?.key ?? null,
      fixtures: out.map((f) => ({
        shot: f.shot_id,
        klass: f.klass,
        dur: f.shot.duration_seconds,
        chars: f.charNames,
        charRefs: f.charRefs.length,
        checkNotes: (f.shot.check_notes ?? []).length,
        hasPrev: !!f.prevShot,
      })),
    },
    null,
    2,
  ),
)
