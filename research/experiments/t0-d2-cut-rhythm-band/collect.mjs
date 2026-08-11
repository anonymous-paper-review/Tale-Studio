// t0-d2-cut-rhythm-band — 씬별 평균 샷 길이 vs D2 허용 구간(v3:102-111) 경계 몰림 검사.
//   소스: 로컬 3런(11_v4_shotDesign.json intent.duration_seconds) + DB 3프로젝트(shots.duration_seconds).
//   구간 배정: 계약 문구에 명시된 art_style만 (live_action→6~9, 2d_anime→5~7, 2d_cartoon→3.5~5).
//     cinematic_realism·gritty_industrial_noir는 미열거 → NA(관측만, 판정 제외 — 판정 3원칙).
//   경계 몰림 지표(사전 등록 "경계 ±10%"의 두 해석을 실행 전에 함께 등록):
//     (a) 경계 ±(구간폭×10%)  (b) 경계값 ×(1±0.1). 균등 기준: 관측 지지집합 내 존 폭 비율.
//   usage: node research/experiments/t0-d2-cut-rhythm-band/collect.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const BANDS = { live_action: [6, 9], '2d_anime': [5, 7], '2d_cartoon': [3.5, 5] }
const LOCAL = [
  '064631aa-f6b2-4f7c-800b-66b0517a2769',
  '5260d92d-2e7b-4991-8bff-00213b37ef77',
  'e4da245a-8d89-44e5-8fde-131d016ef2e3',
]
const DBP = [
  { name: 'Sample1', idPrefix: '9d6efa6d' },
  { name: 'writer_test_260810', idPrefix: 'e1a9fd08' },
  { name: 'Upload_test', idPrefix: '04926a0a' },
]

const sources = []
// 로컬 3런
for (const d of LOCAL) {
  const v4 = JSON.parse(readFileSync(new URL(`../../../logs/${d}/11_v4_shotDesign.json`, import.meta.url), 'utf8'))
  const v0 = JSON.parse(readFileSync(new URL(`../../../logs/${d}/08_v0_visualIdentity.json`, import.meta.url), 'utf8'))
  const byScene = {}
  for (const s of v4.shots) {
    const sid = s.intent.scene_id
    const dur = s.intent.duration_seconds
    if (typeof dur !== 'number') continue
    ;(byScene[sid] ??= []).push(dur)
  }
  sources.push({ name: `local:${d.slice(0, 8)}`, art_style: v0.style.art_style, byScene })
}
// DB 3프로젝트
const { data: projs } = await db.from('projects').select('id,title')
for (const t of DBP) {
  const p = projs.find((x) => x.id.startsWith(t.idPrefix))
  const { data: runs } = await db.from('writer_runs').select('state').eq('project_id', p.id).order('created_at', { ascending: false }).limit(1)
  let art = null
  for (const v of Object.values(runs?.[0]?.state ?? {})) {
    const m = JSON.stringify(v ?? null)?.match(/art_style\":\s*\"([a-z_0-9]+)/)
    if (m) { art = m[1]; break }
  }
  const { data: shots } = await db.from('shots').select('scene_id,duration_seconds').eq('project_id', p.id)
  const byScene = {}
  for (const s of shots ?? []) {
    if (typeof s.duration_seconds !== 'number') continue
    ;(byScene[s.scene_id] ??= []).push(s.duration_seconds)
  }
  sources.push({ name: `db:${t.name}`, art_style: art, byScene })
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const rows = []
for (const src of sources) {
  const band = BANDS[src.art_style] ?? null
  for (const [sid, durs] of Object.entries(src.byScene)) {
    rows.push({ source: src.name, art_style: src.art_style, band, scene: sid, n_shots: durs.length, avg: +mean(durs).toFixed(3) })
  }
}

// 경계 몰림 — 구간 확정 소스만
const judged = rows.filter((r) => r.band)
const zoneShare = (rs, zones) => {
  const inZone = rs.filter((r) => zones.some(([a, b]) => r.avg >= a && r.avg <= b)).length
  return { inZone, n: rs.length, share: rs.length ? +(inZone / rs.length).toFixed(4) : null }
}
const analyze = (rs, label) => {
  if (!rs.length) return null
  const [lo, hi] = rs[0].band
  const w = hi - lo
  const support = [Math.min(...rs.map((r) => r.avg)), Math.max(...rs.map((r) => r.avg))]
  const sw = Math.max(support[1] - support[0], 0.001)
  const clip = ([a, b]) => [Math.max(a, support[0]), Math.min(b, support[1])]
  const mk = (zones) => {
    const cz = zones.map(clip).filter(([a, b]) => b > a)
    const zw = cz.reduce((s, [a, b]) => s + (b - a), 0)
    const obs = zoneShare(rs, zones)
    const uni = zw / sw
    return { zones, observed: obs, uniform_share: +uni.toFixed(4), overrep: obs.share != null && uni > 0 ? +(obs.share / uni).toFixed(2) : null }
  }
  return {
    label, band: [lo, hi], n_scenes: rs.length, support,
    interp_a_bandwidth10: mk([[lo - w * 0.1, lo + w * 0.1], [hi - w * 0.1, hi + w * 0.1]]),
    interp_b_value10: mk([[lo * 0.9, lo * 1.1], [hi * 0.9, hi * 1.1]]),
    inside_band: zoneShare(rs, [[lo, hi]]),
    below_band: rs.filter((r) => r.avg < lo).length,
    above_band: rs.filter((r) => r.avg > hi).length,
    histogram_bins_0p5: Object.fromEntries(
      Object.entries(rs.reduce((h, r) => { const b = (Math.floor(r.avg / 0.5) * 0.5).toFixed(1); h[b] = (h[b] ?? 0) + 1; return h }, {})).sort((x, y) => +x[0] - +y[0]),
    ),
  }
}

const out = {
  ticket: 't0-d2-cut-rhythm-band', date: '2026-08-11',
  contract: 'src/lib/writer/pipeline/stages/v3_scene_plan.ts:102-111 — 고밀도(live_action 등) 6~9s / 중밀도(2d_anime 등) 5~7s / 저밀도(2d_cartoon 등) 3.5~5s',
  band_assignment_rule: '계약 문구에 명시된 art_style만 배정. cinematic_realism·gritty_industrial_noir는 NA(판정 제외)',
  per_scene: rows,
  analysis: {
    live_action: analyze(judged.filter((r) => r.art_style === 'live_action'), 'live_action(로컬 3런)'),
    '2d_cartoon': analyze(judged.filter((r) => r.art_style === '2d_cartoon'), '2d_cartoon(Upload_test)'),
    na_sources: rows.filter((r) => !r.band).reduce((acc, r) => { acc[r.source] = acc[r.source] ?? { art_style: r.art_style, scenes: 0 }; acc[r.source].scenes++; return acc }, {}),
  },
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
const brief = ({ label, n_scenes, interp_a_bandwidth10: a, interp_b_value10: b, inside_band, below_band, above_band, histogram_bins_0p5 }) =>
  ({ label, n_scenes, a_share: a.observed.share, a_uniform: a.uniform_share, a_overrep: a.overrep, b_share: b.observed.share, b_uniform: b.uniform_share, b_overrep: b.overrep, inside: inside_band.share, below: below_band, above: above_band, hist: histogram_bins_0p5 })
for (const k of ['live_action', '2d_cartoon']) if (out.analysis[k]) console.log(JSON.stringify(brief(out.analysis[k])))
console.log('NA:', JSON.stringify(out.analysis.na_sources))
