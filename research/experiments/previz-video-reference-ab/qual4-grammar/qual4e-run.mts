// 정성수집 4차 보강 — 교정 조건 ⓔ 1편. 관찰 전용, 판정·점수 없음.
//   왜: ⓑⓒⓓ(순서형 계열)는 도입 정면 구간에 **카메라 움직임 서술이 통째로 빠져** 있었다.
//       위치만 적혀 있고(정면 가슴 높이·문이 어깨 뒤), ⓐ(타임코드)에 있던 후퇴 운동
//       (그녀보다 느리게 후퇴 → 간격 6.0m→4.8m → 화면 안에서 커짐)과 각도·높이·롤 고정이 없다.
//       그래서 "초를 안 써서 전환이 빨라졌다"와 "정면 구간에 할 일이 없어서 빨리 넘어갔다"가
//       구분되지 않는다. ⓔ는 **정면 구간 서술만** 보강해 이 교란을 가른다.
//   조작 축: ⓒ 프롬프트 문자열에 문장 3개 삽입 — 그 외 한 글자도 바꾸지 않는다.
//            (프롬프트를 손으로 다시 쓰지 않고 prompt_c.txt를 읽어 **프로그램으로 삽입**한다.
//             삽입 앵커가 정확히 1회 매치되지 않으면 실패 — 나머지 구간 불변을 기계가 보증)
//            초 표기 금지(순서형 유지) — ⓐ의 0.0-1.0s 대목을 시각 표기만 빼고 옮긴 수준.
//   입력 고정: manifest.json#jobs[arm=c].input을 **그대로 복제**하고 prompt만 교체.
//              (START·블록아웃·모델·해상도·duration·오디오 전부 ⓒ와 동일 — 재유도 금지)
// 예산 하드캡 $2 — submit 전 검사, 초과 시 발주 거부. 재시도 1회(실패분은 청구되지 않으므로
//   캡 계산에서 제외하되 총 시도는 2회로 하드 제한).
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/qual4-grammar/qual4e-run.mts \
//         prompt | submit | collect | finalize | frames
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { VIDEO_MODELS } from '@/lib/video-models'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const MANIFEST = join(DIR, 'manifest.json')
const ARM = 'e'
const LABEL =
  'ⓒ + 도입 정면 구간 카메라 운동 보강(후퇴·간격 6m→4.8m·화면 안에서 커짐·각도/높이/롤 고정, 초 표기 없음)'

const spec = VIDEO_MODELS.seedance
const RATE_WITH_VIDEO_INPUT = 0.1814 // ⓑⓒⓓ와 동일 출처(fal 모델 페이지 2026-08-11 실측)
const BUDGET_CAP_USD = 2.0
const MAX_ATTEMPTS = 2 // 최초 1 + 재시도 1

/** ⓐ 대조군에 있었으나 순서형 계열에서 빠진 "정면 구간의 할 일" — 시각 표기만 제거해 옮김 */
const FRONT_AUGMENT =
  'That single move begins while the camera is still head-on: it retreats along the corridor slightly slower than she runs. ' +
  'The gap between them closes from about 6 m to about 4.8 m and she grows larger in frame as it gives ground. ' +
  'Through that whole head-on stretch its angle, its height and its roll do not change — only the distance between them shrinks.'

const ANCHOR = 'and holds it for the rest of the shot. First she faces the lens;'

interface Job {
  arm: string
  attempt: number
  label: string
  request_id: string
  endpoint: string
  model_key: string
  resolution?: unknown
  duration_seconds: number
  est_cost_usd: number
  rate_per_sec_usd: number
  input: Record<string, unknown>
  submitted_at: string
  done?: boolean
  failed?: boolean
  error?: string
  video_url?: string
  local?: string
  observed_output?: Record<string, unknown>
  confirmed_cost_usd?: number
}

interface Manifest {
  jobs: Job[]
  [k: string]: unknown
}

function readManifest(): Manifest {
  if (!existsSync(MANIFEST)) throw new Error(`manifest 없음: ${MANIFEST}`)
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

function jobC(prov: Manifest): Job {
  const c = prov.jobs.find((j) => j.arm === 'c' && j.done)
  if (!c) throw new Error('manifest에서 ⓒ 완료 job 회수 실패 — payload 복제 불가')
  return c
}

/** ⓒ 프롬프트에 정면 보강 3문장을 삽입 (앵커 1회 매치 강제 = 나머지 불변 보증) */
function augment(promptC: string): string {
  const hits = promptC.split(ANCHOR).length - 1
  if (hits !== 1) throw new Error(`삽입 앵커 매치 ${hits}회 — 1회여야 한다`)
  const out = promptC.replace(
    ANCHOR,
    `and holds it for the rest of the shot. ${FRONT_AUGMENT} First she faces the lens;`,
  )
  if (/\d\s*(s\b|sec|second)/i.test(FRONT_AUGMENT))
    throw new Error('보강문에 시각 표기가 섞였다 — 순서형 위반')
  return out
}

/** inputs/prompt_e.txt + inputs/diff_c_to_e.txt 생성 */
function buildPrompt(): void {
  const pcPath = join(DIR, 'inputs', 'prompt_c.txt')
  const pePath = join(DIR, 'inputs', 'prompt_e.txt')
  const promptC = readFileSync(pcPath, 'utf8')
  writeFileSync(pePath, augment(promptC))
  let diff = ''
  try {
    execFileSync('diff', ['-u', pcPath, pePath])
  } catch (e) {
    diff = String((e as { stdout?: Buffer }).stdout ?? '')
  }
  if (!diff.trim()) throw new Error('diff 비어 있음 — 보강 삽입 실패')
  writeFileSync(
    join(DIR, 'inputs', 'diff_c_to_e.txt'),
    `# ⓒ → ⓔ 프롬프트 차이 (조작 축: 도입 정면 구간 서술 보강 3문장 삽입, 그 외 불변)\n` +
      `# 생성: qual4e-run.mts prompt (prompt_c.txt를 읽어 앵커 1회 치환)\n` +
      `# 삽입 위치: "…and holds it for the rest of the shot." 다음, "First she faces the lens;" 앞\n` +
      `# 삽입된 문장 전문(이것 말고 바뀐 글자 없음):\n` +
      FRONT_AUGMENT.split('. ')
        .filter(Boolean)
        .map((s, i) => `#   ${i + 1}. ${s.endsWith('.') ? s : `${s}.`}`)
        .join('\n') +
      `\n\n${diff}`,
  )
  console.log('prompt → inputs/prompt_e.txt, diff → inputs/diff_c_to_e.txt')
}

/** ⓒ input 전문을 복제하고 prompt만 교체 — 다른 필드는 손대지 않는다 */
function buildInput(prov: Manifest): Record<string, unknown> {
  const c = jobC(prov)
  const promptE = readFileSync(join(DIR, 'inputs', 'prompt_e.txt'), 'utf8').trim()
  const promptC = readFileSync(join(DIR, 'inputs', 'prompt_c.txt'), 'utf8').trim()
  if (promptC !== String(c.input.prompt).trim())
    throw new Error('inputs/prompt_c.txt와 manifest ⓒ payload prompt 불일치 — 기준 붕괴')
  if (promptE === promptC) throw new Error('ⓔ 프롬프트가 ⓒ와 동일 — 보강 미적용')
  return { ...c.input, prompt: promptE }
}

/** 캡 계산: 실패 시도는 fal에서 청구되지 않으므로 제외 (총 시도수는 MAX_ATTEMPTS로 별도 제한) */
function billable(jobs: Job[]): number {
  return +jobs
    .filter((j) => j.arm === ARM && !j.failed)
    .reduce((s, j) => s + (j.est_cost_usd ?? 0), 0)
    .toFixed(4)
}

async function submitOnce(prov: Manifest, attempt: number): Promise<void> {
  const input = buildInput(prov)
  const duration = Number(input.duration)
  const est = +(RATE_WITH_VIDEO_INPUT * duration).toFixed(4)
  const already = billable(prov.jobs)
  if (already + est > BUDGET_CAP_USD)
    throw new Error(
      `예산 하드캡 초과(attempt ${attempt}): billable $${already} + est $${est} > $${BUDGET_CAP_USD}`,
    )
  const { request_id } = await fal.queue.submit(spec.endpoint, { input })
  prov.jobs.push({
    arm: ARM,
    attempt,
    label: LABEL,
    request_id,
    endpoint: spec.endpoint,
    model_key: spec.key,
    resolution: input.resolution,
    duration_seconds: duration,
    est_cost_usd: est,
    rate_per_sec_usd: RATE_WITH_VIDEO_INPUT,
    input,
    submitted_at: new Date().toISOString(),
  })
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`submitted ${ARM} (attempt ${attempt}) → ${request_id}  [est $${est}]`)
}

async function submit() {
  const prov = readManifest()
  if (prov.jobs.some((j) => j.arm === ARM)) {
    console.log('skip — ⓔ 이미 발주됨')
    return
  }
  await submitOnce(prov, 1)
}

async function collect() {
  const prov = readManifest()
  const deadline = Date.now() + 40 * 60_000
  let pending = prov.jobs.filter((j) => j.arm === ARM && !j.done && !j.failed)
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (st.status !== 'COMPLETED') {
          console.log(`... ${job.arm}#${job.attempt}: ${st.status}`)
          continue
        }
        let data: unknown
        try {
          ;({ data } = await fal.queue.result(job.endpoint, { requestId: job.request_id }))
        } catch (e) {
          // fal 큐는 처리 중 실패도 COMPLETED로 두고 result 422가 실패 상세를 돌려준다
          if ((e as { status?: number })?.status === 422) {
            job.failed = true
            job.error = String((e as Error).message ?? e)
            console.error(`FAILED ${job.arm}#${job.attempt}: ${job.error}`)
            continue
          }
          throw e
        }
        const url =
          (data as { video?: { url?: string } })?.video?.url ??
          (data as { video_url?: string })?.video_url
        if (!url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`)
        const dest = join(DIR, `out_${job.arm}.mp4`)
        const res = await fetch(url)
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
        job.done = true
        job.video_url = url
        job.local = dest
        console.log(`done ${job.arm}#${job.attempt} → ${dest}`)
      } catch (e) {
        console.error(`poll ${job.arm}#${job.attempt}: ${(e as Error).message}`)
      }
    }
    // 실패 시 재시도 (총 시도 MAX_ATTEMPTS, 캡 재검사)
    const tries = prov.jobs.filter((j) => j.arm === ARM)
    const live = tries.some((j) => j.done || (!j.done && !j.failed))
    if (!live && tries.length > 0 && tries.length < MAX_ATTEMPTS) {
      try {
        await submitOnce(prov, tries.length + 1)
      } catch (e) {
        console.error(`retry 거부: ${(e as Error).message}`)
      }
    }
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j) => j.arm === ARM && !j.done && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  const ok = prov.jobs.some((j) => j.arm === ARM && j.done)
  console.log(`\ncollected ${ARM}: ${ok ? 'OK' : 'MISS'}  (billable $${billable(prov.jobs)})`)
  if (!ok) process.exitCode = 1
}

/** 프레임 타일 — ⓑⓒⓓ와 동일 파라미터. 프리뷰만 480p·crf28·무음 */
function frames() {
  const src = join(DIR, `out_${ARM}.mp4`)
  if (!existsSync(src)) throw new Error(`클립 없음: ${src}`)
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args])
  const f = (n: string) => join(DIR, 'frames', `${ARM}_${n}`)
  ff(['-i', src, '-vf', 'fps=1,scale=480:-1,tile=4x2', '-frames:v', '1', '-q:v', '3', f('tile.jpg')])
  ff(['-ss', '0', '-t', '3', '-i', src, '-vf', 'fps=4,scale=360:-1,tile=4x3', '-frames:v', '1', '-q:v', '3', f('tile_0-3s_4fps.jpg')])
  ff(['-ss', '2.75', '-t', '2.5', '-i', src, '-vf', 'fps=4,scale=360:-1,tile=5x2', '-frames:v', '1', '-q:v', '3', f('tile_2.75-5.25s_4fps.jpg')])
  ff(['-ss', '5', '-t', '2', '-i', src, '-vf', 'fps=4,scale=360:-1,tile=4x2', '-frames:v', '1', '-q:v', '3', f('tile_5-7s_4fps.jpg')])
  ff(['-ss', '0', '-i', src, '-frames:v', '1', '-q:v', '2', f('f0.jpg')])
  ff(['-sseof', '-0.1', '-i', src, '-update', '1', '-q:v', '2', f('last.jpg')])
  ff(['-i', src, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-an', '-movflags', '+faststart', join(DIR, `out_${ARM}_preview.mp4`)])
  console.log(`frames ${ARM} ✓ (프리뷰 480p crf28 무음)`)
}

function finalize() {
  const prov = readManifest()
  for (const job of prov.jobs) {
    if (job.arm !== ARM || !job.done || !job.local || !existsSync(job.local)) continue
    const probe = JSON.parse(
      execFileSync('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height:format=duration',
        '-of', 'json',
        job.local,
      ]).toString(),
    )
    job.observed_output = {
      width: probe.streams?.[0]?.width,
      height: probe.streams?.[0]?.height,
      duration_s: +Number(probe.format?.duration).toFixed(3),
      bytes: statSync(job.local).size,
      preview: `out_${ARM}_preview.mp4`,
      frames_tile: `frames/${ARM}_tile.jpg`,
      first_frame: `frames/${ARM}_f0.jpg`,
      last_frame: `frames/${ARM}_last.jpg`,
    }
    job.confirmed_cost_usd = job.est_cost_usd
  }
  prov.total_cost_usd = +prov.jobs
    .filter((j) => !j.failed)
    .reduce((s, j) => s + (j.est_cost_usd ?? 0), 0)
    .toFixed(4)
  prov.arm_e_addendum = {
    purpose:
      '교란 분리 — ⓑⓒⓓ에는 도입 정면 구간에 카메라 운동 서술이 없었다(위치만). ⓔ는 ⓒ에 정면 구간 후퇴 운동만 되살려, "초를 뺀 것"과 "정면에 할 일이 없던 것" 중 무엇이 전환을 앞당겼는지 가른다.',
    manipulated_axis:
      'ⓒ 프롬프트에 3문장 삽입(정면 유지 중 복도를 따라 그녀보다 느리게 후퇴 → 간격 약 6m→4.8m → 화면 안에서 커짐 / 그 구간 내내 각도·높이·롤 불변). 초 표기 없음(순서형 유지).',
    prompt_generation:
      'inputs/prompt_c.txt를 읽어 앵커 1회 치환으로 기계 생성(qual4e-run.mts prompt). 앵커가 1회가 아니면 실패 — 나머지 구간 불변 보증. 차이 전문: inputs/diff_c_to_e.txt',
    payload_source:
      'manifest.json#jobs[arm=c].input 전문 복제 후 prompt만 교체 — START·블록아웃·모델·720p·7s·generate_audio 전부 ⓒ와 동일',
    budget_cap_usd: BUDGET_CAP_USD,
    max_attempts: MAX_ATTEMPTS,
    preview_params: '480p / crf28 / 무음(-an) — ⓑⓒⓓ 프리뷰(crf30·오디오 유지)와 다름',
  }
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`finalized → ${MANIFEST}  total $${prov.total_cost_usd}`)
}

const mode = process.argv[2]
if (mode === 'prompt') buildPrompt()
else if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else if (mode === 'finalize') finalize()
else if (mode === 'frames') frames()
else throw new Error('usage: qual4e-run.mts prompt|submit|collect|finalize|frames')
