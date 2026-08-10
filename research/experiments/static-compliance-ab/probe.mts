// static 계약문 강화 A/B 프로브 — HYPOTHESIS.md 의 측정 절차. B군(강화 문구) 3클립만 신규 생성
//   (A군 = ti2v-camera-cap-recheck 의 T0 클립 재사용).
//   재현성 3규칙: 제품 buildVideoPrompt/VIDEO_MODELS/clampDuration import(복붙 없음).
//   처치 = 산출 프롬프트에서 static 절 문자열 교체 — 원문 부재 시 즉시 중단(제품 문구가 바뀌면
//   이 실험은 무효이므로 조용히 계속하지 않는다).
// 실행: pnpm dlx tsx research/experiments/static-compliance-ab/probe.mts submit|collect
import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import { VIDEO_MODELS, clampDuration, DEFAULT_VIDEO_MODEL } from '@/lib/video-models'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(DIR, 'assets')
const PROV = join(DIR, 'provenance.json')
const PROJECT_ID = '6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a' // Sample2 (1호와 동일)

const spec = VIDEO_MODELS[DEFAULT_VIDEO_MODEL]

// 현행 static 절 (motion-contract.ts static 분기 원문) — 이걸 찾아서 교체한다.
const CURRENT_CLAUSE =
  'Camera: LOCKED tripod shot — absolutely zero camera movement for the entire clip: no pan, no drift, no zoom, no push-in.'
// 강화 문구 (처치 B): 고정 마운트 비유 + 프레이밍 불변식 + 피사체 이탈 허용.
const STRENGTHENED_CLAUSE =
  'Camera: LOCKED static shot, rigidly bolted in place — the framing is identical from the first frame to the last: no pan, no tilt, no drift, no zoom, no push-in, no reframing of any kind. Subjects may move within or out of this fixed frame; the camera NEVER follows or re-aims. The last frame shows the exact same background composition as the first frame.'

// 1호 T0 과 동일한 입력 고정 (같은 샷·같은 인물 모션·같은 static spec)
const CAM_STATIC: ShotDynamicSpec['camera_motion'] = { type: 'static', speed: 'slow', magnitude: 'minimal' }
const PROBES: Array<{ shot_id: string; character_motion: ShotDynamicSpec['character_motion'] }> = [
  { shot_id: 'sh_04_16', character_motion: [{ character_id: 'girl', verb: 'sprints at full speed toward the ventilation shaft', magnitude: 'large' }] },
  { shot_id: 'sh_01_02', character_motion: [{ character_id: 'girl', verb: 'brushes dust off the tin can and exhales', magnitude: 'small' }] },
  { shot_id: 'sh_02_05', character_motion: [] },
]

async function loadShots() {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data, error } = await db
    .from('shots')
    .select('shot_id, action_description, storyboard_image, duration_seconds')
    .eq('project_id', PROJECT_ID)
    .in('shot_id', PROBES.map((p) => p.shot_id))
  if (error) throw error
  return data!
}

async function submit() {
  mkdirSync(ASSETS, { recursive: true })
  const shots = await loadShots()
  const jobs: Array<Record<string, unknown>> = []
  for (const probe of PROBES) {
    const shot = shots.find((s) => s.shot_id === probe.shot_id)
    if (!shot) throw new Error(`shot missing: ${probe.shot_id}`)
    const startFrame: string | undefined = shot.storyboard_image?.frames?.start
    if (!startFrame) throw new Error(`no start frame: ${probe.shot_id}`)
    const durationSeconds = Number(shot.duration_seconds) || 5
    const dynamicSpec = {
      shot_id: probe.shot_id,
      camera_motion: CAM_STATIC,
      character_motion: probe.character_motion,
      motion_prompt: '',
    } as ShotDynamicSpec
    const { fullPrompt } = buildVideoPrompt({
      prompt: shot.action_description ?? '',
      generationMethod: 'I2V',
      modelKey: spec.key,
      durationSeconds,
      startEndReference: false,
      dynamicSpec,
    })
    if (!fullPrompt.includes(CURRENT_CLAUSE)) {
      throw new Error(`현행 static 절 원문이 프롬프트에 없음 — 제품 문구 변경? 실험 중단: ${probe.shot_id}`)
    }
    const treated = fullPrompt.replace(CURRENT_CLAUSE, STRENGTHENED_CLAUSE)
    const input: Record<string, unknown> = {
      prompt: treated,
      [spec.refParam]: [startFrame],
      duration: spec.duration.mode === 'fixed' ? spec.duration.value : clampDuration(spec, durationSeconds),
    }
    if (spec.resolutions.length > 0) input.resolution = spec.defaultResolution
    if (spec.audioParam) input[spec.audioParam] = spec.audioDefault
    const { request_id } = await fal.queue.submit(spec.endpoint, { input })
    jobs.push({
      key: `${probe.shot_id}__B`,
      shot_id: probe.shot_id,
      arm: 'B_strengthened',
      request_id,
      endpoint: spec.endpoint,
      duration_seconds: durationSeconds,
      prompt_control: fullPrompt,
      prompt_treated: treated,
      input,
      submitted_at: new Date().toISOString(),
    })
    console.log(`submitted ${probe.shot_id}__B → ${request_id}`)
  }
  writeFileSync(PROV, JSON.stringify({ model: spec.endpoint, project_id: PROJECT_ID, control_arm: 'ti2v-camera-cap-recheck T0 재사용', jobs }, null, 2))
  console.log(`\n${jobs.length} jobs → ${PROV}`)
}

async function collect() {
  const prov = JSON.parse(readFileSync(PROV, 'utf8'))
  let pending = prov.jobs.filter((j: { done?: boolean }) => !j.done)
  const deadline = Date.now() + 15 * 60_000
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.endpoint, { requestId: job.request_id, logs: false })
        if (st.status === 'COMPLETED') {
          const { data } = await fal.queue.result(job.endpoint, { requestId: job.request_id })
          const url =
            (data as { video?: { url?: string } })?.video?.url ??
            (data as { video_url?: string })?.video_url
          if (!url) throw new Error(`no video url: ${JSON.stringify(data).slice(0, 200)}`)
          const dest = join(ASSETS, `${job.key}.mp4`)
          const res = await fetch(url)
          writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
          job.done = true
          job.video_url = url
          job.local = dest
          console.log(`done ${job.key} → ${dest}`)
        } else {
          console.log(`... ${job.key}: ${st.status}`)
        }
      } catch (e) {
        console.error(`poll ${job.key}: ${(e as Error).message}`)
      }
    }
    writeFileSync(PROV, JSON.stringify(prov, null, 2))
    pending = prov.jobs.filter((j: { done?: boolean }) => !j.done)
    if (pending.length) await new Promise((r) => setTimeout(r, 20_000))
  }
  console.log(`\ncollected ${prov.jobs.length - pending.length}/${prov.jobs.length}`)
  if (pending.length) process.exitCode = 1
}

const mode = process.argv[2]
if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else throw new Error('usage: probe.mts submit|collect')
