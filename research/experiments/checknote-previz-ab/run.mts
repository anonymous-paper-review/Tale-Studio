// 검수 노트 → 러프 화면 A/B 실행기.
//
// 실행:
//   pnpm dlx tsx research/experiments/checknote-previz-ab/run.mts plan
//   pnpm dlx tsx research/experiments/checknote-previz-ab/run.mts submit [--smoke]
//   pnpm dlx tsx research/experiments/checknote-previz-ab/run.mts collect
//   pnpm dlx tsx research/experiments/checknote-previz-ab/run.mts judge
//   pnpm dlx tsx research/experiments/checknote-previz-ab/run.mts report
//
// 재현성 규칙: 러프 셀·그리드 프롬프트·노트 파싱·이미지 발주는 제품 함수를 직접 import한다.
// 표본·판정 질문은 plan 시점에 fixtures.json/manifest.json에 동결한다.

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { fal } from '@fal-ai/client'

const DIR = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(DIR, 'assets')
const FIXTURES = join(DIR, 'fixtures.json')
const MANIFEST = join(DIR, 'manifest.json')
const JUDGMENTS = join(DIR, 'judgments.json')
const RESULTS = join(DIR, 'results.json')
const RESULT_MD = join(DIR, 'result.md')
const REVIEW_HTML = join(DIR, 'review.html')

const SOURCE_PROJECTS = [
  '5260d92d-2e7b-4991-8bff-00213b37ef77',
  'e4da245a-8d89-44e5-8fde-131d016ef2e3',
] as const
const REPS = 3
const MAX_USD = 25
// fal 모델의 요청별 청구 조회 API가 없어, 발주 전 보수적인 예산 가드로만 사용한다.
// 실제 단가는 fal 대시보드에서 확인할 수 있도록 결과에 별도 기록한다.
const UNIT_USD_GUARD = 0.2
const MODEL = 'openai/gpt-image-2/edit'
const TEMPLATE_LOCAL = join(process.cwd(), 'public', 'rough-storyboard-strip.png')
const JUDGE_DEADLINE_MS = 240_000
const COLLECT_DEADLINE_MS = 240_000

type Arm = 'note' | 'control'
type Branch = 'A-mechanical' | 'B-llm' | 'boundary'

type Product = {
  buildRoughGridCell: typeof import('@/lib/writer/rough-storyboard-grid')['buildRoughGridCell']
  buildRoughGridPrompt: typeof import('@/lib/writer/rough-storyboard-grid')['buildRoughGridPrompt']
  buildCellContinuityLine: typeof import('@/lib/writer/rough-storyboard-grid')['buildCellContinuityLine']
  stripColor: typeof import('@/lib/writer/rough-storyboard')['stripColor']
  parseCheckConstraints: typeof import('@/lib/writer/check-notes')['parseCheckConstraints']
  falImageSubmit: typeof import('@/lib/writer/llm/fal')['falImageSubmit']
}
let P: Product

async function loadProduct(): Promise<Product> {
  if (P) return P
  const [grid, notes, falLib, rough] = await Promise.all([
    import('@/lib/writer/rough-storyboard-grid'),
    import('@/lib/writer/check-notes'),
    import('@/lib/writer/llm/fal'),
    import('@/lib/writer/rough-storyboard'),
  ])
  P = {
    buildRoughGridCell: grid.buildRoughGridCell,
    buildRoughGridPrompt: grid.buildRoughGridPrompt,
    buildCellContinuityLine: grid.buildCellContinuityLine,
    parseCheckConstraints: notes.parseCheckConstraints,
    stripColor: rough.stripColor,
    falImageSubmit: falLib.falImageSubmit,
  }
  return P
}

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex').slice(0, 16)
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
const writeJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const html = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

interface SourceRow {
  project_id: string
  shot_id: string
  scene_id: string | null
  sort_order: number | null
  shot_type: string | null
  action_description: string | null
  characters: string[] | null
  duration_seconds: number | null
  camera_config: Record<string, unknown> | null
  lighting_config: Record<string, unknown> | null
  focal_length: number | null
  aperture: number | null
  check_notes: unknown
  static_spec: Record<string, any> | null
  dynamic_spec: Record<string, any> | null
  prompt: string | null
  design_ref: string | null
}

interface Fixture {
  fixture_id: string
  index: number
  branch: Branch
  branch_basis: string
  source: {
    project_id: string
    project_title: string
    shot_id: string
    scene_id: string | null
    sort_order: number | null
  }
  shot: SourceRow
  check_notes: Array<{ category?: string; severity?: string; constraint?: string }>
  constraints: string[]
  continuity_line: string | null
  base_cell: { shotId: string; start: string; motion: string; end: string }
  prompts: { control: string; note: string }
  o1_questions: string[]
  o2_rubric: {
    shot_size: string
    figure_count: number
    figure_positions: string[]
    background_anchor: string
    focal_point: string
  }
}

interface Frozen {
  plannedAt: string
  protocol: {
    source_projects: string[]
    reps: number
    model: string
    template: string
    manipulation: string
    branch_mapping: string
    note: string
  }
  projects: Array<{ id: string; title: string; style_anchor_key: string | null }>
  fixtures: Fixture[]
}

interface Job {
  key: string
  pair_key: string
  fixture_id: string
  fixture_index: number
  branch: Branch
  shot_id: string
  arm: Arm
  rep: number
  blind_side: 'left' | 'right'
  blind_file: string
  model: string
  template_sha: string
  prompt: string
  constraints: string[]
  o1_questions: string[]
  o2_rubric: Fixture['o2_rubric']
  request_id?: string
  model_actual?: string
  fal_request?: Record<string, unknown>
  submitted_at?: string
  status?: 'submitted' | 'completed' | 'failed'
  error?: string
  out_url?: string
  local?: string
  collected_at?: string
}

interface Manifest {
  plannedAt: string
  templateLocal: string
  templateSha: string
  templateUrl?: string
  cost: {
    maxUsd: number
    unitUsdGuard: number
    modelCalls: number
    estimatedUsdGuard: number
    note: string
  }
  frozen: Frozen
  jobs: Job[]
}

function noteObjects(row: SourceRow): Array<{ category?: string; severity?: string; constraint?: string }> {
  return Array.isArray(row.check_notes) ? (row.check_notes as Array<{ category?: string; severity?: string; constraint?: string }>) : []
}

function firstConstraint(row: SourceRow): string {
  return P.parseCheckConstraints(row.check_notes)[0] ?? ''
}

function branchCandidates(rows: SourceRow[], branch: Branch): SourceRow[] {
  const category = branch === 'A-mechanical' ? 'action_budget' : branch === 'B-llm' ? 'continuity' : 'verisimilitude'
  return rows
    .filter((row) => noteObjects(row).length === 1 && noteObjects(row)[0]?.category === category)
    .sort((a, b) => (a.project_id + String(a.sort_order)).localeCompare(b.project_id + String(b.sort_order)))
}

function balancedTake(rows: SourceRow[], count: number): SourceRow[] {
  const byProject = new Map<string, SourceRow[]>()
  for (const row of rows) byProject.set(row.project_id, [...(byProject.get(row.project_id) ?? []), row])
  const projects = [...byProject.keys()].sort()
  const out: SourceRow[] = []
  while (out.length < count && projects.length) {
    let progressed = false
    for (const project of projects) {
      if (out.length >= count) break
      const bucket = byProject.get(project) ?? []
      const row = bucket.shift()
      if (!row) continue
      out.push(row)
      progressed = true
    }
    if (!progressed) break
  }
  return out
}

function selectRows(rows: SourceRow[]): Array<{ row: SourceRow; branch: Branch; basis: string }> {
  const selected: Array<{ row: SourceRow; branch: Branch; basis: string }> = []
  const used = new Set<string>()
  const add = (row: SourceRow, branch: Branch, basis: string) => {
    const key = `${row.project_id}:${row.shot_id}`
    if (used.has(key)) return
    used.add(key)
    selected.push({ row, branch, basis })
  }

  for (const row of balancedTake(branchCandidates(rows, 'A-mechanical'), 6))
    add(row, 'A-mechanical', 'check_notes.category=action_budget; 단일 노트 샷; 런별 3개 균형')
  for (const row of balancedTake(branchCandidates(rows, 'B-llm'), 6))
    add(row, 'B-llm', 'check_notes.category=continuity; 단일 노트 샷; 런별 3개 균형')
  for (const row of balancedTake(branchCandidates(rows, 'boundary'), 5))
    add(row, 'boundary', 'check_notes.category=verisimilitude; 단일 노트 샷')

  // 사용자가 제안서에서 직접 지목한 경계 사례를 마지막 한 칸으로 고정한다.
  const pronoun = rows.find((row) => /pronoun references/i.test(JSON.stringify(row.check_notes)))
  if (pronoun) add(pronoun, 'boundary', '제안서에서 지목한 대명사 지시 — 화면 단계 부적합 경계 사례')

  if (selected.length !== 18) {
    throw new Error(`층화 표본이 18개가 아님: ${selected.length}`)
  }
  return selected
}

function projectInput(row: SourceRow, previous: SourceRow | null, projectTitle: string): Fixture['base_cell'] extends never ? never : any {
  const staticSpec = row.static_spec ?? {}
  const dynamicSpec = row.dynamic_spec ?? undefined
  return {
    shotType: row.shot_type ?? staticSpec.shot_type ?? 'MS',
    actionDescription: row.action_description ?? '',
    characterNames: row.characters ?? [],
    location: null,
    timeOfDay: null,
    mood: null,
    cameraPitch: (row.camera_config?.pan as number | null | undefined) ?? null,
    focalLength: row.focal_length,
    aperture: row.aperture,
    lightPosition: (row.lighting_config?.position as string | null | undefined) ?? null,
    durationSeconds: row.duration_seconds,
    spec: { staticSpec, dynamicSpec },
    _projectTitle: projectTitle,
    _previous: previous,
  }
}

async function fetchFrozenRows(): Promise<{ rows: SourceRow[]; projects: Frozen['projects'] }> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [{ data: projects, error: projectError }, { data: rows, error: shotError }] = await Promise.all([
    db.from('projects').select('id,title,style_anchor_key').in('id', SOURCE_PROJECTS),
    db
      .from('shots')
      .select('project_id,shot_id,scene_id,sort_order,shot_type,action_description,characters,duration_seconds,camera_config,lighting_config,focal_length,aperture,check_notes,static_spec,dynamic_spec,prompt,design_ref')
      .in('project_id', SOURCE_PROJECTS)
      .order('project_id')
      .order('sort_order'),
  ])
  if (projectError) throw projectError
  if (shotError) throw shotError
  if (!rows?.length) throw new Error('실험 원천 shots가 비어 있음')
  return {
    rows: rows as SourceRow[],
    projects: (projects ?? []).map((p) => ({ id: p.id as string, title: p.title as string, style_anchor_key: (p.style_anchor_key as string | null) ?? null })),
  }
}

async function plan() {
  await loadProduct()
  if (!existsSync(TEMPLATE_LOCAL)) throw new Error(`템플릿 없음: ${TEMPLATE_LOCAL}`)
  const templateSha = sha(readFileSync(TEMPLATE_LOCAL))
  const { rows, projects } = await fetchFrozenRows()
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]))
  const rowsByProject = new Map<string, SourceRow[]>()
  for (const row of rows) rowsByProject.set(row.project_id, [...(rowsByProject.get(row.project_id) ?? []), row])

  const selected = selectRows(rows)
  const fixtures: Fixture[] = selected.map(({ row, branch, basis }, index) => {
    const siblings = rowsByProject.get(row.project_id) ?? []
    const previous = siblings.find((candidate) => candidate.sort_order === (row.sort_order ?? -1) - 1) ?? null
    const previousText = ((previous?.prompt || previous?.action_description) ?? '').trim()
    const continuityLine = previous && previous.scene_id === row.scene_id && previousText
      ? P.buildCellContinuityLine(previousText)
      : null
    const input = projectInput(row, previous, projectTitle.get(row.project_id) ?? row.project_id)
    const baseCell = P.buildRoughGridCell(input, row.shot_id)
    const constraints = P.parseCheckConstraints(row.check_notes)
    const makePrompt = (arm: Arm) => {
      const extra = [continuityLine, arm === 'note' && constraints.length ? `Continuity constraints: ${constraints.join('; ')}` : null]
        .filter(Boolean)
      const cell = {
        ...baseCell,
        start: extra.length ? `${baseCell.start}. ${extra.join('. ')}` : baseCell.start,
      }
      return P.buildRoughGridPrompt([cell], 'strip1')
    }
    const staticSpec = row.static_spec ?? {}
    const blocking = Array.isArray(staticSpec.character_blocking) ? staticSpec.character_blocking : []
    const layers = staticSpec.framing?.layers ?? {}
    const cleanVisual = (value: unknown, fallback: string) => {
      const cleaned = P.stripColor(String(value ?? '')).replace(/\s{2,}/g, ' ').trim()
      return cleaned || fallback
    }
    const rubric = {
      shot_size: String(row.shot_type ?? staticSpec.shot_type ?? 'MS'),
      figure_count: blocking.length,
      figure_positions: blocking.map((b: any) => String(b.position_in_frame ?? 'center')),
      background_anchor: cleanVisual(layers.background ?? layers.midground ?? layers.foreground, 'the main setting'),
      focal_point: cleanVisual(staticSpec.framing?.focal_point, 'the main action'),
    }
    const o1Questions = constraints.map(
      (constraint) => `Does the three-panel rough storyboard visibly satisfy this requirement in the relevant shot moment? Requirement: ${constraint}`,
    )
    return {
      fixture_id: `fx_${String(index + 1).padStart(2, '0')}`,
      index,
      branch,
      branch_basis: basis,
      source: {
        project_id: row.project_id,
        project_title: projectTitle.get(row.project_id) ?? row.project_id,
        shot_id: row.shot_id,
        scene_id: row.scene_id,
        sort_order: row.sort_order,
      },
      shot: row,
      check_notes: noteObjects(row),
      constraints,
      continuity_line: continuityLine,
      base_cell: baseCell,
      prompts: { control: makePrompt('control'), note: makePrompt('note') },
      o1_questions: o1Questions,
      o2_rubric: rubric,
    }
  })

  const frozen: Frozen = {
    plannedAt: new Date().toISOString(),
    protocol: {
      source_projects: [...SOURCE_PROJECTS],
      reps: REPS,
      model: MODEL,
      template: 'public/rough-storyboard-strip.png → fal storage upload → product rough-grid strip1 path',
      manipulation: '두 팔의 유일한 차이는 제품 러프보드 경로가 cell.start에 붙이는 Continuity constraints 줄의 유무다.',
      branch_mapping: 'A=action_budget, B=continuity, boundary=verisimilitude + 제안서의 pronoun 사례. 갈래별 결과는 6장씩의 지시적 신호로만 읽는다.',
      note: '현재 소스의 writer/rough-storyboard 경로는 appendCheckConstraints가 아니라 parseCheckConstraints + cell-local append를 사용한다. 사전 제안서의 좌표와 구현이 어긋나므로 결과에 방법 이탈로 기록한다. 조작 자체와 측정 기준은 변경하지 않는다.',
    },
    projects,
    fixtures,
  }
  writeJson(FIXTURES, frozen)

  const jobs: Job[] = []
  for (const fixture of fixtures) {
    for (let rep = 1; rep <= REPS; rep++) {
      const pairKey = `${fixture.fixture_id}__r${rep}`
      const noteLeft = (fixture.index + rep) % 2 === 0
      for (const arm of ['note', 'control'] as Arm[]) {
        const blindSide = (arm === 'note') === noteLeft ? 'left' : 'right'
        jobs.push({
          key: `${pairKey}__${arm}`,
          pair_key: pairKey,
          fixture_id: fixture.fixture_id,
          fixture_index: fixture.index,
          branch: fixture.branch,
          shot_id: fixture.source.shot_id,
          arm,
          rep,
          blind_side: blindSide,
          blind_file: `${pairKey}__${blindSide}.png`,
          model: MODEL,
          template_sha: templateSha,
          prompt: fixture.prompts[arm],
          constraints: fixture.constraints,
          o1_questions: fixture.o1_questions,
          o2_rubric: fixture.o2_rubric,
        })
      }
    }
  }
  const estimated = +(jobs.length * UNIT_USD_GUARD).toFixed(2)
  if (estimated > MAX_USD) throw new Error(`예산 가드 실패: ${estimated} > ${MAX_USD}`)
  const manifest: Manifest = {
    plannedAt: frozen.plannedAt,
    templateLocal: TEMPLATE_LOCAL,
    templateSha,
    cost: {
      maxUsd: MAX_USD,
      unitUsdGuard: UNIT_USD_GUARD,
      modelCalls: jobs.length,
      estimatedUsdGuard: estimated,
      note: '보수적 상한 계산일 뿐 실제 모델 단가가 아니다. fal 요청별 청구 조회 API가 없어 실제 금액은 대시보드 확인 대상이다.',
    },
    frozen,
    jobs,
  }
  writeJson(MANIFEST, manifest)
  console.log(JSON.stringify({
    fixtures: fixtures.length,
    byBranch: Object.fromEntries([...new Set(fixtures.map((f) => f.branch))].map((b) => [b, fixtures.filter((f) => f.branch === b).length])),
    jobs: jobs.length,
    estimatedUsdGuard: estimated,
    templateSha,
    sourceCounts: SOURCE_PROJECTS.map((id) => ({ id, shots: rows.filter((r) => r.project_id === id).length, noteShots: rows.filter((r) => r.project_id === id && P.parseCheckConstraints(r.check_notes).length > 0).length })),
  }, null, 2))
}

async function ensureTemplateUrl(manifest: Manifest): Promise<string> {
  if (manifest.templateUrl) return manifest.templateUrl
  const buf = readFileSync(manifest.templateLocal)
  const url = await fal.storage.upload(new Blob([buf], { type: 'image/png' }))
  manifest.templateUrl = url
  writeJson(MANIFEST, manifest)
  return url
}

async function submit(smoke: boolean) {
  await loadProduct()
  const manifest = readJson<Manifest>(MANIFEST)
  const remaining = manifest.jobs.filter((job) => !job.request_id && job.status !== 'completed')
  const targets = smoke ? remaining.slice(0, 2) : remaining
  if (!targets.length) {
    console.log('제출할 잡 없음')
    return
  }
  const projected = manifest.jobs.length * manifest.cost.unitUsdGuard
  if (projected > manifest.cost.maxUsd) throw new Error(`예산 가드 실패: ${projected} > ${manifest.cost.maxUsd}`)
  const templateUrl = await ensureTemplateUrl(manifest)
  let cursor = 0
  const worker = async () => {
    while (cursor < targets.length) {
      const job = targets[cursor++]
      try {
        const receipt = await P.falImageSubmit({
          model: MODEL,
          prompt: job.prompt,
          reference_image_urls: [templateUrl],
        })
        job.request_id = receipt.request_id
        job.model_actual = receipt.model
        job.fal_request = receipt.fal_request
        job.submitted_at = new Date().toISOString()
        job.status = 'submitted'
        writeJson(MANIFEST, manifest)
        console.log(`submitted ${job.key} → ${job.request_id}`)
      } catch (e) {
        job.status = 'failed'
        job.error = (e as Error).message
        writeJson(MANIFEST, manifest)
        console.error(`submit failed ${job.key}: ${job.error}`)
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  const submitted = manifest.jobs.filter((job) => job.request_id).length
  console.log(`제출 완료: ${submitted}/${manifest.jobs.length} (이번 호출 ${targets.length}건)`)
}

async function collect() {
  const manifest = readJson<Manifest>(MANIFEST)
  mkdirSync(ASSETS, { recursive: true })
  const deadline = Date.now() + COLLECT_DEADLINE_MS
  let pending = manifest.jobs.filter((job) => job.request_id && job.status !== 'completed' && job.status !== 'failed')
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      if (!job.request_id) continue
      try {
        const endpoint = job.model_actual ?? MODEL
        const status = await fal.queue.status(endpoint, { requestId: job.request_id, logs: false }) as any
        if (status.status === 'FAILED') {
          job.status = 'failed'
          job.error = String(status.error ?? 'fal queue failed')
          continue
        }
        if (status.status !== 'COMPLETED') continue
        const result = await fal.queue.result(endpoint, { requestId: job.request_id })
        const data = result.data as any
        const url = data?.images?.[0]?.url ?? data?.image?.url
        if (!url) throw new Error(`완료 결과에 이미지 URL 없음: ${JSON.stringify(data).slice(0, 240)}`)
        const response = await fetch(url)
        if (!response.ok) throw new Error(`이미지 다운로드 실패: HTTP ${response.status}`)
        const local = join(ASSETS, job.blind_file)
        writeFileSync(local, Buffer.from(await response.arrayBuffer()))
        job.status = 'completed'
        job.out_url = url
        job.local = local
        job.collected_at = new Date().toISOString()
        console.log(`collected ${job.key}`)
      } catch (e) {
        job.error = (e as Error).message
        console.error(`collect ${job.key}: ${job.error}`)
      }
    }
    writeJson(MANIFEST, manifest)
    pending = manifest.jobs.filter((job) => job.request_id && job.status !== 'completed' && job.status !== 'failed')
    if (pending.length) await sleep(10_000)
  }
  const completed = manifest.jobs.filter((job) => job.status === 'completed').length
  const failed = manifest.jobs.filter((job) => job.status === 'failed').length
  console.log(JSON.stringify({ completed, failed, pending: pending.length }, null, 2))
  if (pending.length) process.exitCode = 2
}

function verdictValue(v: any, field: 'match' | 'pick'): number | null {
  if (!v || v.judge_error || v.confidence !== 'high') return null
  const value = v[field]
  if (field === 'match' && (value === 0 || value === 1)) return value
  if (field === 'pick' && (value === 0 || value === 1 || value === 2)) return value
  return null
}
function o1Values(job: Job, trial: any): Array<number | null> {
  const raw = Array.isArray(trial?.o1_by_constraint)
    ? trial.o1_by_constraint
    : job.constraints.length === 1
      ? [trial?.o1]
      : []
  return raw.map((value: any) => verdictValue(value, 'match'))
}

function exactSignP(wins: number, losses: number): number | null {
  const n = wins + losses
  if (!n) return null
  const k = Math.min(wins, losses)
  let coefficient = 1
  let tail = 1
  for (let i = 1; i <= k; i++) {
    coefficient *= (n - i + 1) / i
    tail += coefficient
  }
  return Math.min(1, 2 * tail / 2 ** n)
}

function stats(rows: Array<{ note: Array<number | null>; control: Array<number | null> }>) {
  const note = rows.flatMap((r) => r.note).filter((x): x is number => x === 0 || x === 1)
  const control = rows.flatMap((r) => r.control).filter((x): x is number => x === 0 || x === 1)
  const paired = rows.flatMap((r) =>
    r.note.map((noteValue, index) => ({ note: noteValue, control: r.control[index] ?? null })),
  ).filter((r) => r.note !== null && r.control !== null)
  const wins = paired.filter((r) => r.note === 1 && r.control === 0).length
  const losses = paired.filter((r) => r.note === 0 && r.control === 1).length
  return {
    note_n: note.length,
    note_rate: note.length ? +(note.reduce((a, b) => a + b, 0) / note.length).toFixed(4) : null,
    control_n: control.length,
    control_rate: control.length ? +(control.reduce((a, b) => a + b, 0) / control.length).toFixed(4) : null,
    paired_n: paired.length,
    note_wins: wins,
    control_wins: losses,
    ties: paired.filter((r) => r.note === r.control).length,
    sign_p: exactSignP(wins, losses),
    delta_pp: note.length && control.length ? +((note.reduce((a, b) => a + b, 0) / note.length - control.reduce((a, b) => a + b, 0) / control.length) * 100).toFixed(2) : null,
  }
}

function score(manifest: Manifest, judgments: any) {
  const fixtures = manifest.frozen.fixtures
  const byKey = new Map(manifest.jobs.map((job) => [job.key, job]))
  const pairRows = fixtures.flatMap((fixture) =>
    Array.from({ length: REPS }, (_, i) => {
      const pairKey = `${fixture.fixture_id}__r${i + 1}`
      const note = manifest.jobs.find((j) => j.pair_key === pairKey && j.arm === 'note')!
      const control = manifest.jobs.find((j) => j.pair_key === pairKey && j.arm === 'control')!
      const tj = judgments.trials ?? {}
      const n = tj[note.key]
      const c = tj[control.key]
      return {
        fixture_id: fixture.fixture_id,
        branch: fixture.branch,
        pair_key: pairKey,
        note_key: note.key,
        control_key: control.key,
        o1: { note: o1Values(note, n), control: o1Values(control, c) },
        o2: { note: [verdictValue(n?.o2, 'match')], control: [verdictValue(c?.o2, 'match')] },
        o3: judgments.pairs?.[pairKey] ?? null,
      }
    }),
  )
  const axisStats = (axis: 'o1' | 'o2', subset = pairRows) => stats(subset.map((r) => ({ note: r[axis].note, control: r[axis].control })))
  const branchStats = Object.fromEntries(
    (['A-mechanical', 'B-llm', 'boundary'] as Branch[]).map((branch) => {
      const subset = pairRows.filter((r) => r.branch === branch)
      return [branch, { n_pairs: subset.length, o1: axisStats('o1', subset), o2: axisStats('o2', subset), o3: o3Stats(subset) }]
    }),
  )
  const overall = {
    pairs_planned: pairRows.length,
    o1: axisStats('o1'),
    o2: axisStats('o2'),
    o3: o3Stats(pairRows),
  }
  const plannedByAxis = {
    o1: manifest.jobs.reduce((sum, job) => sum + job.constraints.length, 0),
    o2: manifest.jobs.length,
    o3: pairRows.length,
  }
  const plannedJudgments = Object.values(plannedByAxis).reduce((a, b) => a + b, 0)
  const completedJudgments = Object.keys(judgments.trials ?? {}).reduce((n, key) => {
    const j = judgments.trials[key]
    const o1Count = Array.isArray(j?.o1_by_constraint) ? j.o1_by_constraint.length : j?.o1 ? 1 : 0
    return n + o1Count + (j?.o2 ? 1 : 0)
  }, 0) + Object.keys(judgments.pairs ?? {}).length
  const usableByAxis = {
    o1: manifest.jobs.reduce((sum, job) => sum + o1Values(job, judgments.trials?.[job.key]).filter((value) => value !== null).length, 0),
    o2: manifest.jobs.filter((job) => verdictValue(judgments.trials?.[job.key]?.o2, 'match') !== null).length,
    o3: overall.o3.n,
  }
  const naByAxis = Object.fromEntries(
    (['o1', 'o2', 'o3'] as const).map((axis) => [
      axis,
      {
        planned: plannedByAxis[axis],
        usable: usableByAxis[axis],
        na: plannedByAxis[axis] - usableByAxis[axis],
        na_rate: plannedByAxis[axis] ? +((plannedByAxis[axis] - usableByAxis[axis]) / plannedByAxis[axis]).toFixed(4) : null,
      },
    ]),
  )
  const usableJudgments = Object.values(usableByAxis).reduce((a, b) => a + b, 0)
  const na = {
    planned_judgments: plannedJudgments,
    completed_judgments: completedJudgments,
    usable_judgments: usableJudgments,
    na_rate: plannedJudgments ? +((plannedJudgments - usableJudgments) / plannedJudgments).toFixed(4) : null,
    by_axis: naByAxis,
  }
  const rejectMain = overall.o3.sign_p !== null && overall.o3.sign_p >= 0.05 && (overall.o1.delta_pp ?? 0) < 10
  const pushConfirmed = overall.o2.control_wins > overall.o2.note_wins && overall.o2.sign_p !== null && overall.o2.sign_p < 0.05
  const instrumentFailed = Object.values(naByAxis).some((axis) => axis.na_rate !== null && axis.na_rate > 0.3)
  return {
    scoredAt: new Date().toISOString(),
    protocol: manifest.frozen.protocol,
    overall,
    by_branch: branchStats,
    na,
    preregistered_conditions: {
      main_hypothesis_rejected: rejectMain,
      pushback_confirmed: pushConfirmed,
      instrument_failed: instrumentFailed,
      note: '갈래별 N=6쌍은 지시적 신호로만 읽고 전체 54쌍을 주 판정으로 삼는다.',
    },
    pair_rows: pairRows,
    source_job_status: Object.fromEntries([...byKey].map(([key, job]) => [key, job.status ?? null])),
  }
}

function o3Stats(rows: Array<{ o3: any }>) {
  const valid = rows.map((r) => r.o3).filter((v) => v && (v.winner === 'note' || v.winner === 'control' || v.winner === 'tie'))
  const noteWins = valid.filter((v) => v.winner === 'note').length
  const controlWins = valid.filter((v) => v.winner === 'control').length
  return {
    n: valid.length,
    note_wins: noteWins,
    control_wins: controlWins,
    ties: valid.filter((v) => v.winner === 'tie').length,
    sign_p: exactSignP(noteWins, controlWins),
    note_win_rate_excluding_ties: noteWins + controlWins ? +(noteWins / (noteWins + controlWins)).toFixed(4) : null,
  }
}

async function judge() {
  const manifest = readJson<Manifest>(MANIFEST)
  const J = await import('../previz-channel-ablation/judge.mts')
  const judgments = existsSync(JUDGMENTS) ? readJson<any>(JUDGMENTS) : { judge: { model: J.JUDGE_MODEL, temperature: 0, imageWidth: J.JUDGE_IMAGE_WIDTH, jpegQuality: J.JUDGE_IMAGE_QUALITY }, trials: {}, pairs: {} }
  const deadline = Date.now() + JUDGE_DEADLINE_MS
  const completedJobs = manifest.jobs.filter((job) => job.status === 'completed' && job.local)
  for (const job of completedJobs) {
    const trial = judgments.trials?.[job.key]
    if (trial && !trial.o1_by_constraint && job.constraints.length === 1 && trial.o1) {
      trial.o1_by_constraint = [trial.o1]
    }
  }
  const pendingJobs = completedJobs.filter((job) => {
    const trial = judgments.trials?.[job.key]
    return !Array.isArray(trial?.o1_by_constraint) || trial.o1_by_constraint.length !== job.constraints.length || !trial?.o2
  })
  let cursor = 0
  const judgeTrial = async (job: Job) => {
    const image = job.local!
    const o1Prompts = job.o1_questions.map((question) => [
      'IMAGE is a three-panel rough storyboard strip for one film shot.',
      'Judge ONLY whether this one continuity constraint is visibly satisfied by the drawn panels.',
      'Do not judge artistic quality, realism, color, or the written prompt. If the constraint is about language or something the image cannot show, return confidence="low".',
      `Constraint: ${question}`,
      'Return JSON only: {"match":0 or 1,"confidence":"high|low","reason":"<=20 words"}',
    ].join('\n'))
    const o2Prompt = [
      'IMAGE is a three-panel rough storyboard strip for one film shot.',
      'Judge ONLY whether the original shot order is preserved: shot size, figure count and placement, and one structural background anchor.',
      `Original shot size: ${job.o2_rubric.shot_size}. Figure count: ${job.o2_rubric.figure_count}. Figure positions: ${job.o2_rubric.figure_positions.join(', ') || 'none'}. Background anchor: ${job.o2_rubric.background_anchor}. Focal point: ${job.o2_rubric.focal_point}.`,
      'Ignore color, lighting, and the continuity constraint. If the requested elements are not visible enough, return confidence="low".',
      'Return JSON only: {"match":0 or 1,"confidence":"high|low","reason":"<=20 words"}',
    ].join('\n')
    const safe = async (fn: () => Promise<any>) => {
      try { return await fn() } catch (e) { return { judge_error: (e as Error).message, confidence: 'low' } }
    }
    const [o1_by_constraint, o2] = await Promise.all([
      Promise.all(o1Prompts.map((prompt) => safe(async () => J.vlmJson([{ text: prompt }, { text: 'IMAGE:' }, await J.imgPart(image)])))),
      safe(async () => J.vlmJson([{ text: o2Prompt }, { text: 'IMAGE:' }, await J.imgPart(image)])),
    ])
    return { key: job.key, arm: job.arm, blind_side: job.blind_side, o1: o1_by_constraint[0], o1_by_constraint, o2, prompts: { o1: o1Prompts, o2: o2Prompt }, judgedAt: new Date().toISOString() }
  }
  const workers = Array.from({ length: 3 }, async () => {
    while (cursor < pendingJobs.length && Date.now() < deadline) {
      const job = pendingJobs[cursor++]
      const out = await judgeTrial(job)
      judgments.trials[out.key] = out
      writeJson(JUDGMENTS, judgments)
      console.log(`judged trial ${out.key}`)
    }
  })
  await Promise.all(workers)

  const pairs = [...new Set(completedJobs.map((job) => job.pair_key))]
    .map((pairKey) => ({ pairKey, note: completedJobs.find((j) => j.pair_key === pairKey && j.arm === 'note'), control: completedJobs.find((j) => j.pair_key === pairKey && j.arm === 'control') }))
    .filter((p): p is { pairKey: string; note: Job; control: Job } => !!p.note?.local && !!p.control?.local)
    .filter((p) => !judgments.pairs?.[p.pairKey])
  cursor = 0
  const judgePair = async (pair: { pairKey: string; note: Job; control: Job }) => {
    const left = pair.note.blind_side === 'left' ? pair.note : pair.control
    const right = pair.note.blind_side === 'right' ? pair.note : pair.control
    const prompt = [
      'IMAGE 1 and IMAGE 2 are two blinded three-panel rough storyboard strips for the same shot.',
      'Which strip is more useful as a previz panel for a director? Consider clear staging, readable action, and preservation of the original shot setup. Do not infer which one received an extra note.',
      'Answer pick=1, pick=2, or pick=0 if genuinely indistinguishable. Return JSON only: {"pick":0 or 1 or 2,"confidence":"high|low","reason":"<=20 words"}',
    ].join('\n')
    try {
      const v = await J.vlmJson([{ text: prompt }, { text: 'IMAGE 1:' }, await J.imgPart(left.local!), { text: 'IMAGE 2:' }, await J.imgPart(right.local!)])
      const pick = v.pick === 1 || v.pick === 2 || v.pick === 0 ? v.pick : null
      const winner = pick === null || v.confidence !== 'high' ? 'unjudged' : pick === 0 ? 'tie' : pick === 1 ? left.arm : right.arm
      return { pair_key: pair.pairKey, pick, confidence: v.confidence, winner, left: left.arm, right: right.arm, reason: v.reason, prompt, judgedAt: new Date().toISOString() }
    } catch (e) {
      return { pair_key: pair.pairKey, pick: null, confidence: 'low', winner: 'unjudged', left: left.arm, right: right.arm, reason: (e as Error).message, prompt, judgedAt: new Date().toISOString() }
    }
  }
  const pairWorkers = Array.from({ length: 3 }, async () => {
    while (cursor < pairs.length && Date.now() < deadline) {
      const pair = pairs[cursor++]
      const out = await judgePair(pair)
      judgments.pairs[out.pair_key] = out
      writeJson(JUDGMENTS, judgments)
      console.log(`judged pair ${out.pair_key}`)
    }
  })
  await Promise.all(pairWorkers)
  writeJson(JUDGMENTS, judgments)
  const scored = score(manifest, judgments)
  writeJson(RESULTS, scored)
  console.log(JSON.stringify({
    trialDone: Object.keys(judgments.trials ?? {}).length,
    pairDone: Object.keys(judgments.pairs ?? {}).length,
    plannedTrials: manifest.jobs.length,
    plannedPairs: manifest.frozen.fixtures.length * REPS,
    naRate: scored.na.na_rate,
  }, null, 2))
  if (Object.keys(judgments.trials ?? {}).length < manifest.jobs.length || Object.keys(judgments.pairs ?? {}).length < manifest.frozen.fixtures.length * REPS) process.exitCode = 2
}

function makeReports() {
  const manifest = readJson<Manifest>(MANIFEST)
  const judgments = existsSync(JUDGMENTS) ? readJson<any>(JUDGMENTS) : { trials: {}, pairs: {} }
  const result = score(manifest, judgments)
  writeJson(RESULTS, result)
  const status = result.na.na_rate !== null && result.na.na_rate > 0.3 ? '측정 불가' : result.na.completed_judgments < result.na.planned_judgments ? '판정 진행 중' : '완료'
  const lines = [
    '# 검수 노트 → 러프 화면 A/B 결과',
    '',
    `- 상태: **${status}**`,
    `- 생성: ${manifest.jobs.length}장 (${manifest.frozen.fixtures.length}샷 × 2팔 × ${REPS}회)`,
    `- 판독: ${result.na.completed_judgments}/${result.na.planned_judgments}건 완료`,
    `- 판정 가능 비율: O1 ${usablePct(result.na.by_axis.o1.na_rate)} / O2 ${usablePct(result.na.by_axis.o2.na_rate)} / O3 ${usablePct(result.na.by_axis.o3.na_rate)} (NA 기준은 낮은 확신 포함)`,
    `- 예산 가드: $${manifest.cost.estimatedUsdGuard.toFixed(2)} 이하로 발주하도록 제한 (실제 단가 확인 필요)`,
    '',
    '## 핵심 판정',
    '',
    `- O1 노트 준수: 노트 팔 ${pct(result.overall.o1.note_rate)} / 대조 팔 ${pct(result.overall.o1.control_rate)} (차이 ${pp(result.overall.o1.delta_pp)}%p, 쌍 ${result.overall.o1.paired_n}개, p=${pval(result.overall.o1.sign_p)})`,
    `- O2 원 지시 보존: 노트 팔 ${pct(result.overall.o2.note_rate)} / 대조 팔 ${pct(result.overall.o2.control_rate)} (차이 ${pp(result.overall.o2.delta_pp)}%p, 쌍 ${result.overall.o2.paired_n}개, p=${pval(result.overall.o2.sign_p)})`,
    `- O3 쓸 만한 쪽: 노트 ${result.overall.o3.note_wins}승 / 대조 ${result.overall.o3.control_wins}승 / 무승부 ${result.overall.o3.ties} (유효 p=${pval(result.overall.o3.sign_p)})`,
    '- 종합: 노트는 화면이 요구사항을 따르는 비율은 크게 올렸지만, 원래 구도를 거의 해치지 않았고, 최종적으로 더 쓸 만한 화면을 고르게 하지는 못했다. 효과는 "화면 준수 개선"으로 확인됐고 "전체 화면 품질 개선"으로는 확인되지 않았다.',
    '',
    '## 갈래별 신호',
    '',
    '| 갈래 | 샷쌍 | O1 노트/대조 | O2 노트/대조 | O3 노트/대조/무승부 |',
    '|---|---:|---:|---:|---:|',
    ...Object.entries(result.by_branch).map(([branch, s]: [string, any]) => `| ${branch} | ${s.n_pairs} | ${pct(s.o1.note_rate)} / ${pct(s.o1.control_rate)} | ${pct(s.o2.note_rate)} / ${pct(s.o2.control_rate)} | ${s.o3.note_wins} / ${s.o3.control_wins} / ${s.o3.ties} |`),
    '',
    '## 사전 등록 조건 대입',
    '',
    `- 주 가설 기각 조건: **${result.preregistered_conditions.main_hypothesis_rejected ? '발동' : '미발동 또는 판정 불충분'}**`,
    `- 밀어내기 확정 조건: **${result.preregistered_conditions.pushback_confirmed ? '발동' : '미발동 또는 판정 불충분'}**`,
    `- 판독기 실패 조건(NA > 30%): **${result.preregistered_conditions.instrument_failed ? '발동' : '미발동'}**`,
    '',
    '## 해석 경계',
    '',
    '- 갈래별 6쌍은 참고 신호이고, 전체 54쌍이 주 판정 단위다.',
    '- 현재 소스의 `writer/rough-storyboard`는 제안서에 적힌 `appendCheckConstraints` 호출이 아니라 `parseCheckConstraints` 후 셀의 START 문장에 직접 붙인다. 이 구현 차이는 결과를 숨기지 않고 기록한다.',
    '- 의류·색·대명사처럼 흑백 목각 러프 화면에서 보이지 않는 요구는 O1에서 낮은 확신 또는 NA가 되는 것이 정상이며, 이것이 단계 배치 판정의 근거다.',
    '',
    '## 원문 인용',
    '',
  ]
  for (const fixture of manifest.frozen.fixtures.slice(0, 6)) {
    lines.push(`### ${fixture.fixture_id} · ${fixture.source.shot_id} · ${fixture.branch}`)
    lines.push(`- 지적: ${fixture.constraints.join(' / ')}`)
    lines.push(`- 대조 주문서 앞부분: ${fixture.prompts.control.slice(0, 360)}${fixture.prompts.control.length > 360 ? '…' : ''}`)
    lines.push(`- 주입 주문서 차이: ${fixture.prompts.note.slice(Math.max(0, fixture.prompts.note.indexOf('Continuity constraints:')), Math.max(0, fixture.prompts.note.indexOf('Continuity constraints:')) + 320)}`)
    lines.push('')
  }
  lines.push('정본: `research/experiments/checknote-previz-ab/results.json`, `judgments.json`, `review.html`')
  writeFileSync(RESULT_MD, lines.join('\n') + '\n')

  const cards = manifest.frozen.fixtures.flatMap((fixture) => Array.from({ length: REPS }, (_, i) => {
    const pairKey = `${fixture.fixture_id}__r${i + 1}`
    const note = manifest.jobs.find((j) => j.pair_key === pairKey && j.arm === 'note')!
    const control = manifest.jobs.find((j) => j.pair_key === pairKey && j.arm === 'control')!
    const pair = judgments.pairs?.[pairKey]
    const o1n = judgments.trials?.[note.key]?.o1
    const o1c = judgments.trials?.[control.key]?.o1
    const o2n = judgments.trials?.[note.key]?.o2
    const o2c = judgments.trials?.[control.key]?.o2
    const image = (job: Job) => job.local ? `assets/${job.blind_file}` : ''
    return `<article class="card"><h3>${html(fixture.source.shot_id)} · ${html(fixture.branch)} · 반복 ${i + 1}</h3><p class="note"><b>주문서:</b> ${html(fixture.prompts.control.slice(0, 260))}…</p><p class="note"><b>지적:</b> ${html(fixture.constraints.join(' / '))}</p><div class="screens"><figure><img src="${html(image(control))}" alt="대조 팔 화면"><figcaption>대조 팔 · O1 ${html(o1c?.match ?? 'NA')} · O2 ${html(o2c?.match ?? 'NA')}</figcaption></figure><figure><img src="${html(image(note))}" alt="노트 팔 화면"><figcaption>노트 팔 · O1 ${html(o1n?.match ?? 'NA')} · O2 ${html(o2n?.match ?? 'NA')}</figcaption></figure></div><p class="verdict">짝대조: ${html(pair?.winner ?? '미판정')} ${pair?.reason ? `— ${html(pair.reason)}` : ''}</p><details><summary>판독 원문</summary><pre>${html(JSON.stringify({ o1n, o1c, o2n, o2c, pair }, null, 2))}</pre></details></article>`
  })).join('\n')
  const style = `<style>:root{--bg:#F7F5F0;--surface:#FFF;--ink:#22242A;--muted:#6E7077;--line:#E3E0D8;--accent:#A64F2A;--ok:#2F7D4E;--info:#3A6EA5;--mono:ui-monospace,SFMono-Regular,Menlo,monospace}@media(prefers-color-scheme:dark){:root{--bg:#15171B;--surface:#1D2026;--ink:#E9E7E2;--muted:#9C9EA6;--line:#2C2F36;--accent:#E0824F}}*{box-sizing:border-box}body{margin:0;padding:0 20px 80px;background:var(--bg);color:var(--ink);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",sans-serif}.wrap{max-width:1000px;margin:0 auto}header{padding:46px 0 18px;border-bottom:2px solid var(--ink)}h1{line-height:1.25;margin:0 0 10px}h2{margin-top:34px;border-bottom:2px solid var(--ink);padding-bottom:8px}.muted{color:var(--muted)}.summary{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px}.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px;margin:14px 0}.note{color:var(--muted);font-size:13px}.screens{display:grid;grid-template-columns:1fr 1fr;gap:14px}.screens figure{margin:0}.screens img{display:block;width:100%;height:auto;border:1px solid var(--line);background:#fff}.screens figcaption{font-size:13px;padding-top:5px}.verdict{color:var(--accent);font-weight:700}.card pre{white-space:pre-wrap;overflow:auto;font:12px/1.45 var(--mono)}details{border-top:1px dashed var(--line);margin-top:10px;padding-top:8px}@media(max-width:700px){.screens{grid-template-columns:1fr}}</style>`
  writeFileSync(REVIEW_HTML, `<!doctype html><meta charset="utf-8"><title>검수 노트 러프 화면 A/B</title>${style}<main class="wrap"><header><p class="muted">검수 노트 → 러프 화면 A/B</p><h1>같은 장면에서 노트 한 줄이 화면을 바꿨는가</h1><p class="muted">${manifest.frozen.fixtures.length}샷 × 2팔 × ${REPS}회 · 전체 판정은 결과 JSON을 기준으로 한다.</p></header><section class="summary"><h2>요약</h2><p>O1 노트 준수 ${pct(result.overall.o1.note_rate)} / 대조 ${pct(result.overall.o1.control_rate)} · O2 원 지시 보존 ${pct(result.overall.o2.note_rate)} / ${pct(result.overall.o2.control_rate)} · O3 노트 ${result.overall.o3.note_wins}승 / 대조 ${result.overall.o3.control_wins}승 / 무승부 ${result.overall.o3.ties}</p><p class="muted">화면 순서는 사람 판독용으로 대조 팔 → 노트 팔로 공개했으며, 판독 원문은 각 카드 안에 접었다.</p></section><h2>짝지은 화면</h2>${cards}</main>`)
  console.log(JSON.stringify({ result: RESULTS, markdown: RESULT_MD, html: REVIEW_HTML }, null, 2))
}

function pct(value: number | null | undefined) { return value == null ? 'NA' : `${(value * 100).toFixed(1)}%` }
/** 판정 가능 비율 = 1 − NA율. 계획 판정이 0건인 축은 na_rate 가 null 이라 비율 자체가 정의되지
 *  않는다 — 1-null=1 로 흘러 "100% 가능"으로 오표기되던 것을 pct 의 'NA' 관례로 되돌린다. */
function usablePct(naRate: number | null | undefined) { return pct(naRate == null ? null : 1 - naRate) }
function pp(value: number | null | undefined) { return value == null ? 'NA' : value.toFixed(1) }
function pval(value: number | null | undefined) { return value == null ? 'NA' : value.toFixed(4) }

const mode = process.argv[2]
if (mode === 'plan') await plan()
else if (mode === 'submit') await submit(process.argv.includes('--smoke'))
else if (mode === 'collect') await collect()
else if (mode === 'judge') await judge()
else if (mode === 'report') makeReports()
else throw new Error('usage: run.mts plan | submit [--smoke] | collect | judge | report')
