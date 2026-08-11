// 샷 선정 (읽기 전용) — "시작↔끝 변화가 큰" 샷을 서로 다른 프로젝트에서 하나씩.
//   선정 기준은 코드가 계산한다(사람 눈 개입 없음): 시작·끝 그림을 128px 회색조로 줄여
//   평균 절대차 + 구조 차이를 재고, 그 값이 큰 순으로 후보를 세운다.
//   자격 필터: 움직임 명세가 있고(제품 폴백 경로로 해석) · 길이 ≥4초(모델 하한) · 캐릭터 1명 이상.
//   범위: SELECT + 이미지 다운로드. 쓰기 없음.
// 실행: pnpm dlx tsx research/experiments/previz-endframe-ab/select.mts
import { config } from 'dotenv'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

const { supabaseAdmin } = await import('@/lib/supabase/admin')
const { loadShotDesignByMainId, resolveShotDesign } = await import('@/lib/writer/shot-design-state')
const sharp = (await import('sharp')).default

const DIR = dirname(fileURLToPath(import.meta.url))
const RUN = join(DIR, 'run')
const ASSETS = join(RUN, 'assets')
mkdirSync(ASSETS, { recursive: true })

/** 시작↔끝 차이 점수 — 128×72 회색조 평균 절대차(0~255). 값이 클수록 화면이 많이 바뀐 샷. */
async function frameDelta(startUrl: string, endUrl: string): Promise<number | null> {
  try {
    const grab = async (u: string) => {
      const r = await fetch(u)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return sharp(Buffer.from(await r.arrayBuffer()))
        .greyscale()
        .resize(128, 72, { fit: 'fill' })
        .raw()
        .toBuffer()
    }
    const [a, b] = await Promise.all([grab(startUrl), grab(endUrl)])
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
    return +(sum / a.length).toFixed(2)
  } catch {
    return null
  }
}

async function download(url: string, name: string): Promise<string | null> {
  const p = join(ASSETS, name)
  if (existsSync(p)) return name
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    writeFileSync(p, Buffer.from(await r.arrayBuffer()))
    return name
  } catch {
    return null
  }
}

const PROJECT_IDS_EXCLUDED = new Set<string>()

const { data: projects } = await supabaseAdmin
  .from('projects')
  .select('id, title, style_anchor_key')
  .order('created_at', { ascending: false })
  .limit(40)

interface Cand {
  project_id: string
  project_title: string
  style_anchor_key: string | null
  shot_id: string
  scene_id: string | null
  duration_seconds: number
  action: string
  prompt: string
  delta: number
  camera_motion: unknown
  character_motion: unknown
  start: string
  end: string
  characters: string[]
}

const byProject: Record<string, Cand[]> = {}

for (const p of projects ?? []) {
  const pid = p.id as string
  if (PROJECT_IDS_EXCLUDED.has(pid)) continue
  const { data: shots } = await supabaseAdmin
    .from('shots')
    .select('shot_id, scene_id, action_description, prompt, duration_seconds, storyboard_image, design_ref, characters')
    .eq('project_id', pid)
    .not('storyboard_image', 'is', null)
  const withFrames = (shots ?? []).filter((s) => {
    const f = (s.storyboard_image as { frames?: { start?: string; end?: string } } | null)?.frames
    return !!f?.start && !!f?.end && ((s.duration_seconds as number) ?? 0) >= 4
  })
  if (!withFrames.length) continue

  // 움직임 명세 — 제품과 같은 폴백 경로(shots.dynamic_spec 없음 → writer_runs.state.shotDesign)
  const { count } = await supabaseAdmin
    .from('shots')
    .select('shot_id', { count: 'exact', head: true })
    .eq('project_id', pid)
    .not('design_ref', 'is', null)
  const designById = await loadShotDesignByMainId(pid)
  const usesRefs = (count ?? 0) > 0

  const cands: Cand[] = []
  for (const s of withFrames) {
    const design = resolveShotDesign(designById, {
      shotId: s.shot_id as string,
      designRef: (s.design_ref as string | null) ?? null,
    }, usesRefs)
    const dyn = (design as { dynamicSpec?: Record<string, unknown> } | null)?.dynamicSpec ?? null
    if (!dyn) continue
    const cam = (dyn as { camera_motion?: { type?: string } }).camera_motion
    if (!cam?.type || cam.type === 'static') continue // 정지 샷은 시작≈끝 — A/B 변별력 없음
    const chars = ((s.characters as string[] | null) ?? []).filter(Boolean)
    if (!chars.length) continue
    const f = (s.storyboard_image as { frames: { start: string; end: string } }).frames
    const delta = await frameDelta(f.start, f.end)
    if (delta == null) continue
    cands.push({
      project_id: pid,
      project_title: p.title as string,
      style_anchor_key: (p.style_anchor_key as string | null) ?? null,
      shot_id: s.shot_id as string,
      scene_id: (s.scene_id as string | null) ?? null,
      duration_seconds: (s.duration_seconds as number) ?? 5,
      action: String(s.action_description ?? ''),
      prompt: String(s.prompt ?? ''),
      delta,
      camera_motion: cam,
      character_motion: (dyn as { character_motion?: unknown }).character_motion ?? null,
      start: f.start,
      end: f.end,
      characters: chars,
    })
  }
  cands.sort((a, b) => b.delta - a.delta)
  if (cands.length) byProject[pid] = cands.slice(0, 5)
  console.log(`${String(p.title).slice(0, 30).padEnd(32)} 후보 ${cands.length}개  top delta=${cands[0]?.delta ?? '-'}`)
}

// 프로젝트당 1개 — delta 최상위. 프로젝트는 top delta 순으로 4개.
const picked = Object.values(byProject)
  .map((c) => c[0])
  .sort((a, b) => b.delta - a.delta)
  .slice(0, 6)

// 자산 내려받기 — 시작/끝 + 캐릭터 다각도 + 장소 2뷰
const detail: Record<string, unknown>[] = []
for (const c of picked) {
  const tag = `${c.project_title.slice(0, 12).replace(/[^\w가-힣]/g, '')}_${c.shot_id}`
  const files: Record<string, string | null> = {}
  files.start = await download(c.start, `${tag}__start.png`)
  files.end = await download(c.end, `${tag}__end.png`)

  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('character_id, name, appearance, portrait, view_main, view_side_left, view_side_right, view_back')
    .eq('project_id', c.project_id)
    .in('character_id', c.characters)
  const charViews: Record<string, unknown>[] = []
  for (const ch of chars ?? []) {
    const views: Record<string, string | null> = {}
    for (const k of ['view_main', 'view_side_left', 'view_side_right', 'view_back', 'portrait'] as const) {
      const u = ch[k] as string | null
      views[k] = u ? await download(u, `${tag}__${ch.character_id}_${k}.png`) : null
      if (u) views[`${k}__url`] = u
    }
    charViews.push({ character_id: ch.character_id, name: ch.name, appearance: ch.appearance, views })
  }

  const { data: locs } = await supabaseAdmin
    .from('locations')
    .select('location_id, name, visual_description, wide_shot, establishing_shot')
    .eq('project_id', c.project_id)
  const locViews: Record<string, unknown>[] = []
  for (const l of locs ?? []) {
    const views: Record<string, string | null> = {}
    for (const k of ['wide_shot', 'establishing_shot'] as const) {
      const u = l[k] as string | null
      views[k] = u ? await download(u, `${tag}__loc_${l.location_id}_${k}.png`) : null
      if (u) views[`${k}__url`] = u
    }
    locViews.push({ location_id: l.location_id, name: l.name, visual_description: l.visual_description, views })
  }

  detail.push({ ...c, tag, files, characterViews: charViews, locationViews: locViews })
}

writeFileSync(
  join(RUN, 'selection.json'),
  JSON.stringify(
    {
      selectedAt: new Date().toISOString(),
      method:
        '프로젝트별 후보 = 시작·끝 그림 보유 + 길이≥4s + 움직임 명세 존재(제품 폴백 경로) + 카메라 비정지 + 캐릭터 1명 이상. 순위 = 시작·끝 128×72 회색조 평균 절대차. 프로젝트당 최상위 1개, 프로젝트는 delta 상위 6개.',
      candidatesByProject: byProject,
      picked: detail,
    },
    null,
    2,
  ),
)
console.log('\n선정:')
for (const d of detail)
  console.log(
    ` ${String(d.project_title).slice(0, 22).padEnd(24)} ${d.shot_id}  delta=${d.delta}  ${d.duration_seconds}s  ${String(d.action).slice(0, 60)}`,
  )
console.log('\n→ run/selection.json')
