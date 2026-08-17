// 색온도 등차수열 감사 — 채점 전부 코드. 모델 호출 0회. DB 읽기 전용.
//   usage: node research/experiments/color-temp-ramp/audit.mjs
//   출력: results.json (기계용) + 콘솔 요약
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } },
)

// ---- 페이지네이션 조회 (supabase 기본 1000행 상한 회피) ----
async function fetchAll(table, columns, order) {
  const out = []
  const page = 1000
  for (let from = 0; ; from += page) {
    let q = db.from(table).select(columns).range(from, from + page - 1)
    for (const o of order) q = q.order(o, { ascending: true, nullsFirst: true })
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < page) break
  }
  return out
}

const shots = await fetchAll(
  'shots',
  'id, project_id, scene_id, shot_id, sort_order, static_spec, created_at',
  ['project_id', 'sort_order', 'created_at'],
)
const scenes = await fetchAll(
  'scenes',
  'id, project_id, scene_id, time_of_day, sort_order, location',
  ['project_id', 'sort_order'],
)

// ⚠ shots.scene_id 는 scenes.id(UUID) 가 아니라 텍스트 라벨('sc_01')이다.
//    씬 하나를 가리키는 실제 키는 (project_id, scene_id) 조합이다.
const key = (projectId, sceneLabel) => `${projectId}::${sceneLabel}`
const sceneByKey = new Map(scenes.map((s) => [key(s.project_id, s.scene_id), s]))

// ---- 씬별 색온도 수열 뽑기 ----
// 값이 없는 샷(F-002 분할 자식 등 static_spec null)은 건너뛴다.
// 먼저 씬별로 **모든** 샷을 순서대로 모은다 — 값 없는 샷도 자리를 차지해야
// "씬 안에서 몇 번째 샷인가"(청크 경계 계산에 쓰임)가 어긋나지 않는다.
const natKey = (s) => String(s ?? '').replace(/\d+/g, (d) => d.padStart(8, '0'))
const allByScene = new Map()
let shotsWithSpec = 0
let shotsWithTemp = 0
let shotsNonNumericTemp = 0
for (const sh of shots) {
  if (sh.static_spec) shotsWithSpec++
  const k = key(sh.project_id, sh.scene_id)
  if (!allByScene.has(k)) allByScene.set(k, [])
  allByScene.get(k).push(sh)
}
// 샷 순서: sort_order 오름차순 (동률이면 shot_id 자연순)
for (const arr of allByScene.values()) {
  arr.sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || natKey(a.shot_id).localeCompare(natKey(b.shot_id)),
  )
}

// 값이 없는 샷(F-002 분할 자식 등 static_spec null)은 수열에서 건너뛴다.
const byScene = new Map()
for (const [k, arr] of allByScene) {
  const seq = []
  arr.forEach((sh, sceneIndex) => {
    const v = sh.static_spec?.lighting?.color_temp_kelvin
    if (v === undefined || v === null) return
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      shotsNonNumericTemp++
      return
    }
    shotsWithTemp++
    seq.push({
      shot_uuid: sh.id,
      shot_id: sh.shot_id,
      sort_order: sh.sort_order,
      scene_index: sceneIndex, // 씬 안에서 몇 번째 샷인가 (0부터)
      kelvin: v,
    })
  })
  if (seq.length > 0) byScene.set(k, seq)
}

// ---- 밤 판정 (scenes.time_of_day 는 자유 텍스트라 실제 값 목록으로 분류) ----
const NIGHT_EXACT = new Set([
  'night',
  'night (interior)',
  '밤',
  '밤 (지하)',
  '심야',
])
// 낮/밤 어느 쪽이라 단정하기 어려운 값 — 모순 카운트에 넣지 않고 따로 센다.
const TWILIGHT_EXACT = new Set([
  'sunset',
  '일몰',
  'dusk',
  'twilight',
  '황혼',
  'evening',
  'dawn',
  '새벽',
])
const classifyTod = (raw) => {
  const k = String(raw ?? '').trim().toLowerCase()
  if (NIGHT_EXACT.has(k)) return 'night'
  if (TWILIGHT_EXACT.has(k)) return 'twilight_or_ambiguous'
  return 'other'
}

// ---- 등차 판정 ----
const TOLERANCE = 50 // 티켓: 차분 편차 ±50K 이내면 등차로 친다
function analyze(values) {
  const diffs = []
  for (let i = 1; i < values.length; i++) diffs.push(values[i] - values[i - 1])
  const maxD = Math.max(...diffs)
  const minD = Math.min(...diffs)
  const spread = maxD - minD
  const strict = spread === 0 // 차분이 완전히 동일
  const tolerant = spread <= TOLERANCE // ±50K 편차 허용
  const step = strict ? diffs[0] : (values.at(-1) - values[0]) / diffs.length
  return { diffs, spread, strict, tolerant, step }
}

const sceneRows = []
let scenesUnmatched = 0
for (const [k, arr] of byScene) {
  const scene = sceneByKey.get(k)
  if (!scene) scenesUnmatched++
  const [projectId, sceneLabel] = k.split('::')
  const values = arr.map((a) => a.kelvin)
  const row = {
    scene_key: k,
    scene_uuid: scene?.id ?? null,
    scene_label: sceneLabel,
    project_id: projectId,
    time_of_day_raw: scene?.time_of_day ?? null,
    time_of_day_class: scene ? classifyTod(scene.time_of_day) : 'scene_row_missing',
    location: scene?.location ?? null,
    n_values: values.length,
    n_shots_in_scene: allByScene.get(k)?.length ?? values.length,
    shot_ids: arr.map((a) => a.shot_id),
    scene_indices: arr.map((a) => a.scene_index),
    sequence: values,
  }
  if (values.length >= 2) Object.assign(row, analyze(values))
  sceneRows.push(row)
}
sceneRows.sort((a, b) => b.n_values - a.n_values)

// ---- 티켓 판정선 대입 ----
const eligible = sceneRows.filter((r) => r.n_values >= 4) // "값이 4개 이상인 씬"
const arithStrict = eligible.filter((r) => r.strict)
const arithTolerant = eligible.filter((r) => r.tolerant)
// 참고 분해: 계단(step≠0) vs 평평(step==0). 판정선은 건드리지 않고 따로만 센다.
const arithStrictRamp = arithStrict.filter((r) => r.step !== 0)
const arithStrictFlat = arithStrict.filter((r) => r.step === 0)
const arithTolerantRamp = arithTolerant.filter((r) => Math.abs(r.step) > TOLERANCE / 2)
const step300Strict = arithStrict.filter((r) => r.step === 300)
const step300Tolerant = arithTolerant.filter((r) => Math.abs(r.step - 300) <= TOLERANCE)

// ③ 밤인데 4000K 초과로 끝나는 모순 (값 2개 이상인 씬 전부 대상)
const withSeq = sceneRows.filter((r) => r.n_values >= 1)
const nightScenes = withSeq.filter((r) => r.time_of_day_class === 'night')
const nightContradiction = nightScenes.filter((r) => r.sequence.at(-1) > 4000)
const ambiguousScenes = withSeq.filter((r) => r.time_of_day_class === 'twilight_or_ambiguous')
const ambiguousContradiction = ambiguousScenes.filter((r) => r.sequence.at(-1) > 4000)

const todFreqAll = {}
for (const r of withSeq) todFreqAll[String(r.time_of_day_raw)] = (todFreqAll[String(r.time_of_day_raw)] ?? 0) + 1

// ---- 보조 측정 A: 등차 씬의 공차(step) 값 분포 ----
const stepFreq = {}
for (const r of arithStrict) stepFreq[String(r.step)] = (stepFreq[String(r.step)] ?? 0) + 1

// ---- 보조 측정 B: 8샷 경계에서 값이 되돌아가는가 ----
// 제품 코드 src/lib/writer/pipeline/stages/v4_shots.ts 의 SHOT_CHUNK_SIZE = 8 —
// 8샷 넘는 씬은 8개씩 쪼개 별개 LLM 호출로 설계된다. 그 경계에서 값이 떨어지는 비율을
// 경계가 아닌 자리의 하락 비율과 비교한다. (판정선과 무관한 보조 관찰)
const CHUNK = 8
let dropAtBoundary = 0
let totalBoundary = 0
let dropElsewhere = 0
let totalElsewhere = 0
const boundaryScenes = []
for (const r of eligible) {
  const v = r.sequence
  const idx = r.scene_indices
  let sceneBoundaryDrops = 0
  let sceneBoundaries = 0
  for (let i = 1; i < v.length; i++) {
    // 경계 = 두 샷이 서로 다른 8샷 묶음(= 별개 LLM 호출)에 속함
    const isBoundary = Math.floor(idx[i] / CHUNK) !== Math.floor(idx[i - 1] / CHUNK)
    const dropped = v[i] < v[i - 1]
    if (isBoundary) {
      totalBoundary++
      sceneBoundaries++
      if (dropped) {
        dropAtBoundary++
        sceneBoundaryDrops++
      }
    } else {
      totalElsewhere++
      if (dropped) dropElsewhere++
    }
  }
  if (sceneBoundaries > 0)
    boundaryScenes.push({
      scene_label: r.scene_label,
      project_id: r.project_id,
      n_values: r.n_values,
      boundaries: sceneBoundaries,
      boundary_drops: sceneBoundaryDrops,
      sequence: v,
    })
}
const pct = (a, b) => (b === 0 ? null : Math.round((a / b) * 1000) / 10)

const verdictStrict =
  arithStrict.length >= 2 ? 'generation-artifact' : arithStrict.length === 1 ? 'coincidence' : 'coincidence'

const results = {
  run: {
    date: '2026-08-16',
    ticket: '.claude/vault/backlog/audit-color-temp-ramp.md',
    script: 'research/experiments/color-temp-ramp/audit.mjs',
    model_calls: 0,
    spend_usd: 0,
    db_access: 'read-only',
    scoring: 'code-only',
  },
  field_path_check: {
    ticket_wrote: 'shots.static_spec.lighting.color_temp_kelvin / shots.scene_id / scenes.time_of_day',
    found_in_db: true,
    note: '세 경로 모두 실제 DB에 그대로 존재. 이름 불일치 없음.',
    shot_order_column: 'shots.sort_order (티켓에 명시 안 됨 — 실제 컬럼에서 확인해 사용)',
    time_of_day_note:
      'scenes.time_of_day 는 enum 이 아니라 자유 텍스트다 (한국어/영어/괄호주석 혼재, 36종). 밤 판정은 값 목록을 직접 분류했다.',
  },
  totals: {
    shots_total: shots.length,
    shots_with_static_spec: shotsWithSpec,
    shots_with_color_temp: shotsWithTemp,
    shots_nonnumeric_color_temp: shotsNonNumericTemp,
    scenes_total: scenes.length,
    scenes_with_any_value: sceneRows.length,
    scenes_with_4plus_values: eligible.length,
    scene_groups_without_matching_scenes_row: scenesUnmatched,
  },
  criteria: {
    eligible_rule: 'scenes with >= 4 color_temp values',
    arithmetic_strict: 'all adjacent diffs identical (spread == 0)',
    arithmetic_tolerant: `adjacent-diff spread <= ${TOLERANCE}K (ticket "애매값" clause)`,
    night_contradiction: 'time_of_day classified night AND last value > 4000K',
  },
  counts: {
    eligible_scenes: eligible.length,
    arithmetic_strict: arithStrict.length,
    arithmetic_strict_ramp_nonzero_step: arithStrictRamp.length,
    arithmetic_strict_flat_zero_step: arithStrictFlat.length,
    arithmetic_tolerant_50k: arithTolerant.length,
    step_plus300_strict: step300Strict.length,
    step_plus300_tolerant: step300Tolerant.length,
    night_scenes_with_values: nightScenes.length,
    night_contradiction_over_4000: nightContradiction.length,
    ambiguous_twilight_scenes: ambiguousScenes.length,
    ambiguous_twilight_over_4000: ambiguousContradiction.length,
  },
  verdict_by_ticket_line: verdictStrict,
  supplementary_not_part_of_pre_registered_line: {
    step_value_frequency_strict_arithmetic: stepFreq,
    product_code_mechanism: [
      {
        file: 'src/lib/writer/pipeline/stages/v4_shots.ts',
        line: 396,
        text: '- color_temp_kelvin은 V3.lighting_arc.start_K~end_K 사이에서 진행',
        meaning:
          '램프는 모델이 혼자 지어낸 버릇이 아니라 제품 프롬프트가 시킨 것이다 — 씬 계획(V3)의 lighting_arc start_K~end_K 사이를 "진행"하라고 지시한다.',
      },
      {
        file: 'src/lib/writer/pipeline/stages/v4_shots.ts',
        line: 52,
        text: 'const SHOT_CHUNK_SIZE = 8;',
        meaning:
          '8샷 넘는 씬은 8개 묶음마다 별개 LLM 호출로 설계된다. 각 호출이 같은 "진행" 지시를 처음부터 다시 받으므로 램프가 8샷마다 되감길 수 있다.',
      },
    ],
    chunk_boundary_reset: {
      chunk_size: CHUNK,
      drops_at_chunk_boundary: dropAtBoundary,
      total_chunk_boundaries: totalBoundary,
      drop_rate_at_boundary_pct: pct(dropAtBoundary, totalBoundary),
      drops_elsewhere: dropElsewhere,
      total_non_boundary_steps: totalElsewhere,
      drop_rate_elsewhere_pct: pct(dropElsewhere, totalElsewhere),
    },
    f006_seed_scene_recheck: {
      note: 'F-006 원문은 프로젝트 1e166e55 sc_04 을 "2800→4500K, 정확히 +300K/샷"이라 적었다. 실제 수열을 다시 재면 첫 간격만 +200 이라 엄격 등차에도 ±50K 완화 등차에도 들지 않는다.',
    },
  },
  chunk_boundary_scenes: boundaryScenes,
  arithmetic_scenes_strict: arithStrict,
  arithmetic_scenes_tolerant_only: arithTolerant.filter((r) => !r.strict),
  night_contradiction_scenes: nightContradiction,
  time_of_day_raw_frequency: todFreqAll,
  all_scenes: sceneRows,
}

writeFileSync(
  new URL('./results.json', import.meta.url),
  JSON.stringify(results, null, 2),
)

// ---- 콘솔 요약 ----
const L = console.log
L('=== 규모 ===')
L(JSON.stringify(results.totals, null, 2))
L('\n=== 카운트 ===')
L(JSON.stringify(results.counts, null, 2))
L(`\n=== 티켓 판정선 대입 → ${verdictStrict} ===`)
L('\n=== 등차(엄격) 씬 전부 ===')
for (const r of arithStrict) {
  L(
    `${r.scene_label} [${r.project_id?.slice(0, 8)}] tod=${JSON.stringify(r.time_of_day_raw)} n=${r.n_values} step=${r.step}  ${r.sequence.join(' → ')}`,
  )
}
L('\n=== 등차(±50K 허용, 엄격에 안 든 것) ===')
for (const r of results.arithmetic_scenes_tolerant_only) {
  L(
    `${r.scene_label} [${r.project_id?.slice(0, 8)}] tod=${JSON.stringify(r.time_of_day_raw)} n=${r.n_values} diffs=[${r.diffs.join(',')}]  ${r.sequence.join(' → ')}`,
  )
}
L('\n=== 밤인데 4000K 초과로 끝남 ===')
for (const r of nightContradiction) {
  L(`${r.scene_label} [${r.project_id?.slice(0, 8)}] tod=${JSON.stringify(r.time_of_day_raw)} n=${r.n_values} ${r.sequence.join(' → ')}`)
}
L('\n=== 값 4개 이상 씬 상위 25개 수열 ===')
for (const r of eligible.slice(0, 25)) {
  L(
    `${r.scene_label} [${r.project_id?.slice(0, 8)}] tod=${JSON.stringify(r.time_of_day_raw)} n=${r.n_values} spread=${r.spread}  ${r.sequence.join(' → ')}`,
  )
}
L('\n=== 보조 A: 등차(엄격) 씬의 공차 분포 ===')
L(JSON.stringify(stepFreq, null, 2))
L('\n=== 보조 B: 8샷 경계 되감김 ===')
L(JSON.stringify(results.supplementary_not_part_of_pre_registered_line.chunk_boundary_reset, null, 2))
L('\n=== F-006 씨앗 씬 (1e166e55 sc_04) 재측정 ===')
const seed = sceneRows.find((r) => r.project_id?.startsWith('1e166e55') && r.scene_label === 'sc_04')
L(
  seed
    ? `tod=${JSON.stringify(seed.time_of_day_raw)} n=${seed.n_values}  ${seed.sequence.join(' → ')}  diffs=[${seed.diffs.join(',')}] spread=${seed.spread} strict=${seed.strict} tolerant=${seed.tolerant}`
    : 'NOT FOUND',
)
L('\nwrote results.json')
