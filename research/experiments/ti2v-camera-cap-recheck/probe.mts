// TI2V 카메라 캡("둥둥") 재검증 프로브 — HYPOTHESIS.md 의 측정 절차.
//   재현성 3규칙: 제품 buildVideoPrompt/compileMotionContract/VIDEO_MODELS/clampDuration 를
//   그대로 import(복붙 없음). 입력은 Sample2 실사 스트립 3샷으로 고정, 카메라 절만 3티어 변형.
//   좌표: 요청 payload 전문 + request_id 를 provenance.json 에 기록.
// 실행: pnpm dlx tsx research/experiments/ti2v-camera-cap-recheck/probe.mts submit
//       pnpm dlx tsx research/experiments/ti2v-camera-cap-recheck/probe.mts collect
import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
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
const PROJECT_ID = '6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a' // Sample2

const spec = VIDEO_MODELS[DEFAULT_VIDEO_MODEL] // happy-horse

// ── 고정 입력 (사전 등록): 샷 3개, 티어 간 동결되는 인물 모션, 카메라만 변형 ──
type Tier = 'T0' | 'T1' | 'T2'
interface Probe {
  shot_id: string
  camera: Record<Tier, ShotDynamicSpec['camera_motion']>
  character_motion: ShotDynamicSpec['character_motion']
}
const CAM_STATIC: ShotDynamicSpec['camera_motion'] = {
  type: 'static', speed: 'slow', magnitude: 'minimal',
}
const PROBES: Probe[] = [
  {
    shot_id: 'sh_04_16', // 질주 → tracking
    camera: {
      T0: CAM_STATIC,
      T1: { type: 'tracking', direction: 'left_to_right', speed: 'medium', magnitude: 'moderate' },
      T2: { type: 'tracking', direction: 'left_to_right', speed: 'fast', magnitude: 'large' },
    },
    character_motion: [
      { character_id: 'girl', verb: 'sprints at full speed toward the ventilation shaft', magnitude: 'large' },
    ],
  },
  {
    shot_id: 'sh_01_02', // 발견 인서트 → dolly_in (암시적 수요 전멸 클래스)
    camera: {
      T0: CAM_STATIC,
      T1: { type: 'dolly_in', speed: 'slow', magnitude: 'moderate' },
      T2: { type: 'dolly_in', speed: 'medium', magnitude: 'large' },
    },
    character_motion: [
      { character_id: 'girl', verb: 'brushes dust off the tin can and exhales', magnitude: 'small' },
    ],
  },
  {
    shot_id: 'sh_02_05', // 설정 와이드 → pan (프롬프트 미명명 타입)
    camera: {
      T0: CAM_STATIC,
      T1: { type: 'pan', direction: 'left_to_right', speed: 'slow', magnitude: 'moderate' },
      T2: { type: 'pan', direction: 'left_to_right', speed: 'medium', magnitude: 'large' },
    },
    character_motion: [],
  },
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
    for (const tier of ['T0', 'T1', 'T2'] as Tier[]) {
      const dynamicSpec = {
        shot_id: probe.shot_id,
        camera_motion: probe.camera[tier],
        character_motion: probe.character_motion,
        motion_prompt: '',
      } as ShotDynamicSpec
      const { fullPrompt, prompt_parts } = buildVideoPrompt({
        prompt: shot.action_description ?? '',
        generationMethod: 'I2V',
        modelKey: spec.key,
        durationSeconds,
        startEndReference: false, // 사전 등록: END 핀 confound 제거 — START 단일 ref
        dynamicSpec,
      })
      // 라우트와 동일하게 레지스트리 spec 으로 input 구성 (duration clamp/resolution/refParam)
      const input: Record<string, unknown> = {
        prompt: fullPrompt,
        [spec.refParam]: [startFrame],
        duration: spec.duration.mode === 'fixed' ? spec.duration.value : clampDuration(spec, durationSeconds),
      }
      if (spec.resolutions.length > 0) input.resolution = spec.defaultResolution
      if (spec.audioParam) input[spec.audioParam] = spec.audioDefault
      const { request_id } = await fal.queue.submit(spec.endpoint, { input })
      jobs.push({
        key: `${probe.shot_id}__${tier}`,
        shot_id: probe.shot_id,
        tier,
        request_id,
        endpoint: spec.endpoint,
        duration_seconds: durationSeconds,
        dynamic_spec: dynamicSpec,
        motion_contract: prompt_parts.motionContract ?? null,
        input,
        submitted_at: new Date().toISOString(),
      })
      console.log(`submitted ${probe.shot_id}__${tier} → ${request_id}`)
    }
  }
  writeFileSync(PROV, JSON.stringify({ model: spec.endpoint, project_id: PROJECT_ID, jobs }, null, 2))
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
            (data as { video?: { url?: string }; video_url?: string })?.video?.url ??
            (data as { video_url?: string })?.video_url
          if (!url) throw new Error(`no video url in result: ${JSON.stringify(data).slice(0, 200)}`)
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
