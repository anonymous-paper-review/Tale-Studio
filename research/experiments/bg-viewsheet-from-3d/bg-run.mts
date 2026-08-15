// 배경 뷰 시트 2암 정성수집 — ⓐ 3D 각도별 스냅샷 N장 vs ⓑ 장소 사진 1장(현행).
//   티켓 t2-bg-viewsheet-from-3d. 관찰 수집 전용 — 판정은 낮 세션(오너 육안) 몫.
//   변인은 **배경 참조물뿐**: 프롬프트·모델·해상도·길이·샷은 두 팔 동일.
//   선례 구조: ../previz-video-reference-ab/qual3-timed/qual3-run.mts (제품 spec import + payload 전문 기록)
//   예산 하드캡 $8 — submit 전 검사, 초과 시 발주 거부.
// 실행: pnpm dlx tsx research/experiments/bg-viewsheet-from-3d/bg-run.mts prep|submit|collect|finalize
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS, clampDuration } from '@/lib/video-models'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const MANIFEST = join(DIR, 'manifest.json')
const PHASE0 = JSON.parse(readFileSync(join(DIR, 'phase0.json'), 'utf8'))

const spec = VIDEO_MODELS.seedance
const RATE_TEXT_ONLY = 0.3024      // 720p, video input 없음 (fal 모델 페이지 2026-08-11 실측)
const BUDGET_CAP_USD = 8.0
const DURATION_S = 5               // 4클립 × 5초 × $0.3024 = $6.05 — 캡 $8 안에서 4클립을 다 뽑기 위한 선택
const MAX_RETRY_PER_ARM = 0        // 예산이 빠듯하다 — 자동 재시도 없음(실패는 실패로 기록)

// 대상 샷 2개 — 같은 로케이션(법정)의 **다른 씬**에서 뽑았다(재방문 일관성이 이 실험의 축).
//   선정 규칙: 배경 수요 실측이 "실수요는 wide+mid, 타이트샷 제외"라 와이드 계열에서 각도가 갈리는 둘.
const SHOTS = [
  { key: 'sh_11_93', why: 'WS · low_angle · 씬 11' },
  { key: 'sh_10_76', why: 'EWS · eye_level · 씬 10' },
]

// 참조 시간 역할 절 — src/lib/director/video-prompt.ts:52-57 문장 재사용(전제 ④: 다장 참조 시 여는 구도 흔들림 방지)
const START_CLAUSE =
  "The first reference image is the shot's START frame and the last reference image is its END frame — " +
  'begin exactly at the START composition and finish exactly at the END composition, with one continuous ' +
  'camera and subject movement between them.'

type ArmKey = 'VIEWSHEET' | 'PHOTO1'

interface Job {
  arm: ArmKey; shot: string; attempt: number; label: string
  request_id: string; endpoint: string; model_key: string
  duration_seconds: number; est_cost_usd: number; rate_per_sec_usd: number
  input: Record<string, unknown>; submitted_at: string
  done?: boolean; failed?: boolean; error?: string
  video_url?: string; local?: string; observed_output?: Record<string, unknown>; confirmed_cost_usd?: number
}

function viewFiles(): string[] {
  // 발주 중 재렌더와의 경합을 막으려고 **동결 사본**에서 읽는다(views_frozen/). 원본은 views/.
  const dir = existsSync(join(DIR, 'views_frozen')) ? join(DIR, 'views_frozen') : join(DIR, 'views')
  if (!existsSync(dir)) throw new Error(`views/ 없음 — 3D 스냅샷 렌더가 선행이다: ${dir}`)
  return readdirSync(dir).filter((f) => /^view_.*\.png$/.test(f)).sort()
}

function readManifest(): any {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  return {
    purpose: '배경 참조를 3D 각도별 스냅샷 N장으로 줄 때 재방문 일관성이 사진 1장보다 서는가 — 관찰 수집(판정 없음)',
    ticket: 't2-bg-viewsheet-from-3d',
    model: spec.endpoint,
    project: PHASE0.project,
    location: { location_id: PHASE0.location.location_id, name: PHASE0.location.name, wide_shot: PHASE0.location.wide_shot },
    shots: SHOTS,
    shot_selection_note:
      '티켓의 "카메라가 공간을 훑는 샷 2개" 를 그대로 적용할 수 없었다 — 이 로케이션 54샷 중 dynamic_spec(카메라 모션 계약) 보유가 0건이라 "훑는지" 를 판정할 데이터가 없다. ' +
      '티켓이 좌표로 지목한 배경 수요 실측("실수요는 wide+mid, 타이트샷 제외")에 따라 와이드 계열 11샷 중 각도가 갈리는 둘(WS/low_angle, EWS/eye_level)을 서로 다른 씬에서 골랐다. 이 대체를 결과에 명시한다.',
    angle_demand_source: PHASE0.angle_demand,
    start_clause_source: 'src/lib/director/video-prompt.ts:52-57 (전제 ④ — 다장 참조 시 여는 구도 고정)',
    pricing_source: 'fal.ai/models/bytedance/seedance-2.0 (2026-08-11 실측): 720p $0.3024/s (video input 없음)',
    duration_note: `클립당 ${DURATION_S}초 — 4클립을 캡 $${BUDGET_CAP_USD} 안에서 뽑기 위한 선택(7초면 $8.47로 초과). 두 팔 동일.`,
    budget_cap_usd: BUDGET_CAP_USD,
    viewsheet: { local_dir: 'views_frozen/ (views/ 의 동결 사본 — 발주 중 재렌더 경합 방지)', files: [] as string[], fal_urls: [] as string[] },
    jobs: [] as Job[],
  }
}

const spent = (jobs: Job[]) => +jobs.reduce((s, j) => s + (j.est_cost_usd ?? 0), 0).toFixed(4)

async function prep() {
  const prov = readManifest()
  const files = viewFiles()
  if (!files.length) throw new Error('views/view_*.png 이 없다')
  if (prov.viewsheet.fal_urls.length === files.length) { console.log('뷰 시트 이미 업로드됨 — skip'); return }
  prov.viewsheet.files = files
  prov.viewsheet.fal_urls = []
  for (const f of files) {
    const srcDir = existsSync(join(DIR, 'views_frozen')) ? join(DIR, 'views_frozen') : join(DIR, 'views')
    const buf = readFileSync(join(srcDir, f))
    const url = await fal.storage.upload(new File([buf], f, { type: 'image/png' }))
    prov.viewsheet.fal_urls.push(url)
    console.log(`uploaded ${f} → ${url}`)
  }
  prov.viewsheet.uploaded_at = new Date().toISOString()
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`prep 완료 — 뷰 ${files.length}장`)
}

// 프롬프트 출처(실측): 이 로케이션 54샷은 **shots.prompt 가 전부 비어 있다**(생성 프롬프트 미저장 프로젝트).
//   그래서 저장된 샷 서술(action_description)을 기반으로 쓴다 — 두 팔에 **동일하게** 들어가므로 변인은 배경 참조뿐이다.
const promptSource: Record<string, string> = {}
function shotPrompt(shotKey: string): string {
  const stored = prompts[shotKey]?.trim()
  const action = actions[shotKey]?.trim()
  const base = stored || action
  if (!base) throw new Error(`샷 프롬프트·서술 둘 다 없음: ${shotKey}`)
  promptSource[shotKey] = stored ? 'shots.prompt' : 'shots.action_description (shots.prompt 가 비어 있음)'
  return `${base} ${START_CLAUSE}`.slice(0, 1200)
}

// 샷 프롬프트/서술 전문은 DB 에서 가져와 manifest 에 그대로 박는다(재현용).
let prompts: Record<string, string> = {}
let actions: Record<string, string> = {}
async function loadPrompts() {
  const { createClient } = await import('@supabase/supabase-js')
  const env = Object.fromEntries(
    readFileSync(join(DIR, '..', '..', '..', '.env.local'), 'utf8')
      .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
  )
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data } = await db.from('shots').select('shot_id,prompt,action_description').eq('project_id', PHASE0.project.id)
    .in('shot_id', SHOTS.map((s) => s.key))
  prompts = Object.fromEntries((data ?? []).map((r: any) => [r.shot_id, r.prompt ?? '']))
  actions = Object.fromEntries((data ?? []).map((r: any) => [r.shot_id, r.action_description ?? '']))
}

async function submit() {
  const prov = readManifest()
  if (!prov.viewsheet.fal_urls?.length) throw new Error('prep 미완료 — 뷰 시트 업로드가 먼저다')
  await loadPrompts()
  const duration = clampDuration(spec, DURATION_S)
  for (const shot of SHOTS) {
    for (const arm of ['VIEWSHEET', 'PHOTO1'] as ArmKey[]) {
      if (prov.jobs.some((j: Job) => j.arm === arm && j.shot === shot.key)) { console.log(`skip ${arm}/${shot.key}`); continue }
      const est = +(RATE_TEXT_ONLY * duration).toFixed(4)
      if (spent(prov.jobs) + est > BUDGET_CAP_USD) throw new Error(`예산 하드캡 초과: ${spent(prov.jobs)} + ${est} > ${BUDGET_CAP_USD}`)
      const refs = arm === 'VIEWSHEET' ? prov.viewsheet.fal_urls : [prov.location.wide_shot]
      const input: Record<string, unknown> = {
        prompt: shotPrompt(shot.key),
        duration,
        ...(spec.resolutions.length > 0 ? { resolution: spec.defaultResolution } : {}),
        ...(spec.audioParam ? { [spec.audioParam]: spec.audioDefault } : {}),
        [spec.refParam]: refs,
      }
      const { request_id } = await fal.queue.submit(spec.endpoint, { input })
      prov.jobs.push({
        arm, shot: shot.key, attempt: 1,
        label: arm === 'VIEWSHEET' ? `3D 각도별 스냅샷 ${refs.length}장` : '현행 장소 사진 1장',
        request_id, endpoint: spec.endpoint, model_key: spec.key,
        duration_seconds: duration, est_cost_usd: est, rate_per_sec_usd: RATE_TEXT_ONLY,
        input, submitted_at: new Date().toISOString(),
      })
      console.log(`submitted ${arm}/${shot.key} → ${request_id} [est $${est}]`)
      writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    }
  }
  prov.prompt_source = promptSource
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`manifest → ${MANIFEST} (spent est $${spent(prov.jobs)})`)
}

async function collect() {
  const prov = readManifest()
  const deadline = Date.now() + 30 * 60_000
  let pending = prov.jobs.filter((j: Job) => !j.done && !j.failed)
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (st.status !== 'COMPLETED') { console.log(`... ${job.arm}/${job.shot}: ${st.status}`); continue }
        let data: unknown
        try { ({ data } = await fal.queue.result(job.endpoint, { requestId: job.request_id })) }
        catch (e) {
          if ((e as { status?: number })?.status === 422) {
            job.failed = true; job.error = String((e as Error).message ?? e)
            console.error(`FAILED ${job.arm}/${job.shot}: ${job.error}`); continue
          }
          throw e
        }
        const url = (data as any)?.video?.url ?? (data as any)?.video_url
        if (!url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`)
        const dest = join(DIR, `out_${job.shot}_${job.arm.toLowerCase()}.mp4`)
        writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()))
        job.done = true; job.video_url = url; job.local = dest
        console.log(`done ${job.arm}/${job.shot} → ${dest}`)
      } catch (e) { console.error(`poll ${job.arm}/${job.shot}: ${(e as Error).message}`) }
    }
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j: Job) => !j.done && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  const done = prov.jobs.filter((j: Job) => j.done).length
  console.log(`\ncollected ${done}/${prov.jobs.length} (spent est $${spent(prov.jobs)})`)
  if (done < prov.jobs.length) process.exitCode = 1
}

function finalize() {
  const prov = readManifest()
  mkdirSync(join(DIR, 'frames'), { recursive: true })
  for (const job of prov.jobs as Job[]) {
    if (!job.done || !job.local || !existsSync(job.local)) continue
    const tag = `${job.shot}_${job.arm.toLowerCase()}`
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration', '-of', 'json', job.local]).toString())
    execFileSync('ffmpeg', ['-y', '-i', job.local, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '28', '-an',
      join(DIR, `out_${tag}_preview.mp4`)], { stdio: 'ignore' })
    execFileSync('ffmpeg', ['-y', '-i', job.local, '-vf', 'fps=1,scale=320:-2,tile=3x2', '-frames:v', '1',
      join(DIR, 'frames', `${tag}_tile.jpg`)], { stdio: 'ignore' })
    execFileSync('ffmpeg', ['-y', '-i', job.local, '-vf', 'select=eq(n\\,0)', '-frames:v', '1',
      join(DIR, 'frames', `${tag}_f0.jpg`)], { stdio: 'ignore' })
    job.observed_output = {
      width: probe.streams?.[0]?.width, height: probe.streams?.[0]?.height,
      duration_s: +Number(probe.format?.duration).toFixed(3), bytes: statSync(job.local).size,
      preview: `out_${tag}_preview.mp4`, frames_tile: `frames/${tag}_tile.jpg`, first_frame: `frames/${tag}_f0.jpg`,
    }
    job.confirmed_cost_usd = job.est_cost_usd
  }
  prov.total_cost_usd = spent(prov.jobs)
  prov.cost_note = '단가 = fal 모델 페이지 2026-08-11 실측(720p $0.3024/s). 요청별 청구 조회 API가 없어 비용 = 단가 × duration.'
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized → ${MANIFEST} total $${prov.total_cost_usd}`)
}

const mode = process.argv[2]
if (mode === 'prep') await prep()
else if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'finalize') finalize()
else throw new Error('usage: bg-run.mts prep|submit|collect|finalize')
