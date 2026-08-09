// previz 검증기 — 집계기. 에이전트 산출 + 정답지 대조 → 축별 점수.
//   usage: node agg.mjs <runDir>
//   구포맷(단일 panel)·신포맷(3프레임: 모션/프레임 규율 대조 추가) 모두 지원.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const runDir = process.argv[2]
const W = (f) => join(runDir, 'work', f)
const load = (f) => (existsSync(W(f)) ? JSON.parse(readFileSync(W(f), 'utf8')) : null)

const key = load('B_answer_key.json')
const stats = load('stats.json')
const det = load('det_findings.json')
const SCENES = [...new Set(key.map((k) => k.scene))].sort()
const missing = []

const SIZE_ORDER = ['ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS']
const ANGLE_MAP = { low_angle: 'low', slightly_low: 'slightly_low', eye_level: 'eye', high_angle: 'high' }
const ANGLE_ORDER = ['low', 'slightly_low', 'eye', 'high']
// 설계 camera_motion.type → 판독 vocab 기대값 (동치 허용 집합)
const MOTION_MAP = {
  static: ['none'], dolly_in: ['push_in'], dolly_out: ['pull_out'],
  handheld_drift: ['drift_shake'], tracking: ['follow'],
  pan: ['pan_left', 'pan_right'], tilt: ['tilt_up', 'tilt_down'],
  crane: ['tilt_up', 'tilt_down', 'unknown'], rack_focus: ['none', 'unknown'],
}

// ---- B: 블라인드 판독 vs 설계 대조
const bRows = []
let hasMotion = false
for (const sc of SCENES) {
  const r = load(`B_${sc}_result.json`)
  if (!r) { missing.push(`B_${sc}`); continue }
  for (const reading of r.readings) {
    const k = key.find((x) => x.shot_id === reading.shot_id)
    if (!k) {
      // 설계 없는 분할 자식 — 대조 불가. 판독값만 기록(NA), 정합률 분모에서 제외.
      const na = { expected: '—', got: null, verdict: 'NA' }
      bRows.push({
        shot_id: reading.shot_id, scene: sc, read: reading, designless: true,
        expected: { shot_type: '설계없음', camera_angle: null },
        size: { ...na, got: reading.size }, angle: { ...na, got: reading.angle },
        figures: { ...na, got: reading.figures }, background: { ...na, got: reading.background?.present },
        ...(reading.cameraMove !== undefined ? { motion: { ...na, got: reading.cameraMove }, discipline: { ...na, got: reading.sameComposition } } : {}),
      })
      continue
    }
    const row = { shot_id: reading.shot_id, scene: sc, read: reading, expected: k }
    if (k.shot_type === '2S') {
      row.size = { expected: '2S', got: reading.size, verdict: 'NA' }
    } else {
      const dd = Math.abs(SIZE_ORDER.indexOf(k.shot_type) - SIZE_ORDER.indexOf(reading.size))
      row.size = { expected: k.shot_type, got: reading.size, verdict: dd === 0 ? 'EXACT' : dd === 1 ? 'ADJ' : 'MISS', dist: dd }
    }
    const expAngle = ANGLE_MAP[k.camera_angle] ?? k.camera_angle
    const ad = Math.abs(ANGLE_ORDER.indexOf(expAngle) - ANGLE_ORDER.indexOf(reading.angle))
    row.angle = { expected: expAngle, got: reading.angle, verdict: ad === 0 ? 'EXACT' : ad === 1 ? 'ADJ' : 'MISS' }
    row.figures = { expected: k.figures, got: reading.figures, verdict: k.figures === reading.figures ? 'EXACT' : 'MISS' }
    row.background = { expected: k.background ? 'yes' : 'no', got: reading.background?.present, verdict: (k.background ? 'yes' : 'no') === reading.background?.present ? 'EXACT' : 'MISS' }
    if (reading.cameraMove !== undefined && k.camera_motion) {
      hasMotion = true
      const allowed = MOTION_MAP[k.camera_motion.type] ?? ['unknown']
      row.motion = { expected: k.camera_motion.type, got: reading.cameraMove, verdict: allowed.includes(reading.cameraMove) ? 'EXACT' : 'MISS' }
      row.discipline = { got: reading.sameComposition, verdict: reading.sameComposition === 'yes' ? 'EXACT' : 'MISS' }
    }
    bRows.push(row)
  }
}
const FIELDS = ['size', 'angle', 'figures', 'background', ...(hasMotion ? ['motion'] : [])]
const tally = (rows, field) => {
  const t = { EXACT: 0, ADJ: 0, MISS: 0, NA: 0 }
  for (const r of rows) { if (r[field]) t[r[field].verdict]++ ; else t.NA++ }
  const denom = rows.length - t.NA
  return { ...t, exactRate: denom ? +(t.EXACT / denom).toFixed(2) : null, tolRate: denom ? +((t.EXACT + t.ADJ) / denom).toFixed(2) : null }
}
const bSummary = {
  shots: bRows.length, hasMotion,
  size: tally(bRows, 'size'), angle: tally(bRows, 'angle'),
  figures: tally(bRows, 'figures'), background: tally(bRows, 'background'),
  ...(hasMotion ? { motion: tally(bRows, 'motion'), discipline: tally(bRows, 'discipline') } : {}),
  misses: bRows.filter((r) => FIELDS.some((f) => r[f]?.verdict === 'MISS'))
    .map((r) => ({ shot_id: r.shot_id, scene: r.scene, fields: FIELDS.filter((f) => r[f]?.verdict === 'MISS').map((f) => `${f}: 설계 ${r[f].expected} vs 판독 ${r[f].got}`) })),
}

// ---- A
const aSummary = { scenes: {}, ruleTally: { MET: 0, UNMET: 0, NA: 0 }, issues: [] }
for (const sc of SCENES) {
  const r = load(`A_${sc}_result.json`)
  if (!r) { missing.push(`A_${sc}`); continue }
  for (const x of r.shotRules) if (x.verdict in aSummary.ruleTally) aSummary.ruleTally[x.verdict]++
  aSummary.scenes[sc] = { shotRules: r.shotRules, sceneChecks: r.sceneChecks, summary: r.summary }
  for (const i of r.sceneChecks.filter((c) => c.verdict === 'ISSUE')) aSummary.issues.push({ scene: sc, ...i })
}

// ---- C
const cSummary = { scenes: {}, flags: [], bonus: { leading: 0, negspace: 0, fif: 0 }, shotCount: 0 }
for (const sc of SCENES) {
  const r = load(`C_${sc}_result.json`)
  if (!r) { missing.push(`C_${sc}`); continue }
  cSummary.scenes[sc] = r.shots
  for (const s of r.shots) {
    cSummary.shotCount++
    for (const c of s.checks) {
      if (c.verdict === 'FLAG') cSummary.flags.push({ scene: sc, shot_id: s.shot_id, id: c.id, evidence: c.evidence })
      if (c.verdict === 'APPLIED' && c.id in cSummary.bonus) cSummary.bonus[c.id]++
    }
  }
}

// ---- R
const rSummary = {}
for (const sc of SCENES) {
  const r = load(`R_${sc}_result.json`)
  if (!r) { missing.push(`R_${sc}`); continue }
  rSummary[sc] = r
}

// ---- E: 효과 판독 (rubric v0.2 — 있으면 집계)
let eSummary = null
const eKey = load('E_answer_key.json')
if (eKey) {
  const eRows = []
  for (const sc of SCENES) {
    const r = load(`E_${sc}_result.json`)
    if (!r) { if (eKey.some((k) => k.scene === sc)) missing.push(`E_${sc}`); continue }
    for (const reading of r.readings) {
      const k = eKey.find((x) => x.shot_id === reading.shot_id)
      if (!k) continue
      const row = { shot_id: k.shot_id, scene: k.scene, dramatic_purpose: k.dramatic_purpose, scene_emotion: k.scene_emotion }
      if (k.checks.includes('stance')) {
        row.stance = {
          expected: k.expectedStance, got: reading.stance, angle: k.angle,
          verdict: reading.stance === k.expectedStance ? 'EXACT' : 'MISS',
          evidence: reading.stanceEvidence ?? '',
        }
      }
      if (k.checks.includes('emotion')) {
        row.emotion = {
          got: reading.emotion, verdict: reading.emotion?.legible === 'yes' ? 'EXACT' : 'MISS',
          evidence: reading.emotionEvidence ?? '',
        }
      }
      eRows.push(row)
    }
  }
  const eTally = (field) => {
    const rows = eRows.filter((r) => r[field])
    const exact = rows.filter((r) => r[field].verdict === 'EXACT').length
    return { n: rows.length, exact, rate: rows.length ? +(exact / rows.length).toFixed(2) : null }
  }
  eSummary = { stance: eTally('stance'), emotion: eTally('emotion'), rows: eRows }
}

// ---- A2: 시간·커버리지 오라클 (rubric v0.4 — 있으면 집계)
// 오라클은 설계 길이를 모른 채 내용만으로 추정 → 여기서 설계 길이와 대조
let a2Summary = null
const a2Key = load('A2_answer_key.json')
if (a2Key) {
  const perScene = {}
  const tally = { 적정: 0, 과함: 0, 부족: 0, n: 0 }
  for (const sc of SCENES) {
    const r = load(`A2_${sc}_result.json`)
    if (!r) { missing.push(`A2_${sc}`); continue }
    const shots = (r.shotEstimates ?? []).map((e) => {
      const k = a2Key.find((x) => x.shot_id === e.shot_id)
      const designed = k?.designed_seconds ?? null
      let verdict = 'NA'
      if (designed != null && e.est_min != null) {
        verdict = designed < e.est_min ? '부족' : designed > e.est_max ? '과함' : '적정'
        tally.n++; tally[verdict]++
      }
      return { ...e, designed, verdict }
    })
    perScene[sc] = {
      shots, sceneTotal: r.sceneTotal, missing: r.missing ?? [], redundant: r.redundant ?? [],
      designedTotal: shots.reduce((acc, s) => acc + (s.designed ?? 0), 0),
      pipelineEstimated: a2Key.find((x) => x.scene === sc)?.pipeline_estimated_scene_seconds ?? null,
    }
  }
  a2Summary = {
    perScene, tally,
    missingCount: Object.values(perScene).reduce((acc, s) => acc + s.missing.length, 0),
    redundantCount: Object.values(perScene).reduce((acc, s) => acc + s.redundant.length, 0),
  }
}

const out = { generatedAt: new Date().toISOString(), scenes: SCENES, missing, det, stats, A: aSummary, B: { ...bSummary, rows: bRows }, C: cSummary, R: rSummary, E: eSummary, A2: a2Summary }
writeFileSync(W('aggregate.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify({
  scenes: SCENES, missing,
  A: { ...aSummary.ruleTally, sceneIssues: aSummary.issues.length },
  B: Object.fromEntries(FIELDS.map((f) => [f, bSummary[f]]).concat(hasMotion ? [['discipline', bSummary.discipline]] : [])),
  BmissShots: bSummary.misses.length,
  C: { flags: cSummary.flags.length, bonus: cSummary.bonus, shots: cSummary.shotCount },
  R: Object.keys(rSummary),
}, null, 2))
