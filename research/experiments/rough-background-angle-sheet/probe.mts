// 각도 이행 뷰 시트 — **정성평가용 생성물**(사전 등록 실험 아님, 판정자는 오너의 눈).
//   질문: 참조 사진(정면 와이드 1장)을 주고 **다른 각도**를 발주하면 같은 공간으로 성립하는가.
//   참조에 안 보이는 면(리버스·측면·하이앵글)이 관문. 각 각도를 참조 有/無 두 벌 생성해 대조.
//   재현성: 제품 buildRoughGridCell/buildRoughGridPrompt/falImageSubmit import(복붙 없음).
// 실행: pnpm dlx tsx research/experiments/rough-background-angle-sheet/probe.mts
import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import type { ShotStaticSpec } from '@/lib/writer/types/pipeline'

const { buildRoughGridCell, buildRoughGridPrompt, STRIP_TEMPLATE_PATH } = await import(
  '@/lib/writer/rough-storyboard-grid'
)
const { DEFAULT_EDIT_IMAGE_MODEL, falImageSubmit } = await import('@/lib/writer/llm/fal')

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(DIR, 'assets')
const PROV = join(DIR, 'provenance.json')
const PROJECT_ID = '9d6efa6d-3216-40b0-8a2c-184ab56f02ec' // Sample1
const LOCATION_ID = 'location' // 법정

// 발주할 6각도 — 참조 사진(정면 와이드)에서 "보이는 면"과 "안 보이는 면"을 섞었다.
//   framing.layers 는 감독이 쓰는 발주서 형식 그대로(무엇이 앞/중간/뒤에 오는가).
type Angle = {
  key: string
  label: string
  visible_in_ref: boolean // 참조 사진에 그 면이 보이는가
  shot_type: string
  camera_angle: string
  layers: { foreground?: string; midground?: string; background?: string }
  focal_point: string
  lens_mm: number
}
const ANGLES: Angle[] = [
  {
    key: '1_front_master',
    label: '정면 마스터 — 방청석에서 판사석을 본다',
    visible_in_ref: true,
    shot_type: 'EWS', camera_angle: 'eye_level', lens_mm: 35,
    layers: {
      foreground: 'The empty gallery benches nearest the camera',
      midground: 'The counsel tables and the open well of the court',
      background: "The judge's bench with the court emblem on the wall above it",
    },
    focal_point: "The judge's bench at the far end",
  },
  {
    key: '2_reverse',
    label: '리버스 — 판사석 뒤에서 방청석을 본다 (참조에 없는 면)',
    visible_in_ref: false,
    shot_type: 'WS', camera_angle: 'eye_level', lens_mm: 35,
    layers: {
      foreground: "The back edge of the judge's bench and the empty chairs behind it",
      midground: 'The counsel tables seen from behind the bench',
      background: 'The rows of gallery benches and the entrance doors at the rear of the room',
    },
    focal_point: 'The empty gallery facing the camera',
  },
  {
    key: '3_side_profile',
    label: '측면 — 법정을 옆에서 가로질러 본다 (참조에 없는 면)',
    visible_in_ref: false,
    shot_type: 'WS', camera_angle: 'eye_level', lens_mm: 50,
    layers: {
      foreground: 'The side wall of the courtroom in the near edge of frame',
      midground: "The witness stand in profile with the judge's bench beyond it",
      background: 'The opposite side wall and the gallery benches along it',
    },
    focal_point: 'The witness stand seen in profile',
  },
  {
    key: '4_high_overview',
    label: '하이앵글 — 천장 가까이에서 내려다본다 (참조에 없는 면)',
    visible_in_ref: false,
    shot_type: 'EWS', camera_angle: 'high_angle', lens_mm: 24,
    layers: {
      foreground: 'The ceiling coffer and light fixtures at the top edge of frame',
      midground: "The judge's bench, counsel tables and the aisle laid out below",
      background: 'The polished floor and the gallery benches on both sides',
    },
    focal_point: 'The whole layout of the room seen from above',
  },
  {
    key: '5_low_from_witness',
    label: '로우앵글 — 증인석 자리에서 판사석을 올려다본다',
    visible_in_ref: false,
    shot_type: 'MS', camera_angle: 'low_angle', lens_mm: 50,
    layers: {
      foreground: 'The edge of the witness stand rail at the bottom of frame',
      midground: "The judge's bench looming above the camera",
      background: 'The wall behind the bench and the ceiling above it',
    },
    focal_point: "The raised judge's bench from below",
  },
  {
    key: '6_detail_bench',
    label: '디테일 — 판사석 정면 타이트',
    visible_in_ref: true,
    shot_type: 'MCU', camera_angle: 'eye_level', lens_mm: 85,
    layers: {
      midground: "The centre of the judge's bench",
      background: 'The emblem and the plaque on the wall directly behind it',
    },
    focal_point: 'The emblem above the bench',
  },
]

function specFor(a: Angle): ShotStaticSpec {
  return {
    shot_id: a.key,
    lens_mm: a.lens_mm,
    shot_type: a.shot_type,
    camera_angle: a.camera_angle,
    depth_of_field: 'deep',
    framing: { rule: 'center', layers: a.layers, focal_point: a.focal_point },
    lighting: { key_fill_ratio: '2:1', color_temp_kelvin: 4500, quality: 'soft', key_direction: 'top' },
    character_blocking: [], // 빈 방 — 건축만 보고 판단하려고 인물 제외
    prop_placement: [],
    palette_emphasis: [],
    texture_notes: '',
    color_grading_intent: '',
    first_frame_prompt: '',
  } as ShotStaticSpec
}

async function main() {
  mkdirSync(ASSETS, { recursive: true })
  const { createClient } = await import('@supabase/supabase-js')
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  )

  // 템플릿 — 앱 공개 경로 우선, 안 잡히면 스토리지 업로드 폴백(직전 실험과 동일)
  const baseUrl = (process.env.WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  let templateUrl = baseUrl ? `${baseUrl}${STRIP_TEMPLATE_PATH}` : ''
  const reachable = templateUrl
    ? await fetch(templateUrl, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)
    : false
  if (!reachable) {
    const local = readFileSync(join(DIR, '../../../public', STRIP_TEMPLATE_PATH.replace(/^\//, '')))
    const p = `research/rough-background-angle-sheet${STRIP_TEMPLATE_PATH}`
    const { error } = await supa.storage.from('media').upload(p, local, { contentType: 'image/png', upsert: true })
    if (error) throw error
    templateUrl = supa.storage.from('media').getPublicUrl(p).data.publicUrl
  }

  const { data: locs, error } = await supa
    .from('locations').select('*').eq('project_id', PROJECT_ID).eq('location_id', LOCATION_ID)
  if (error) throw error
  const wideShot: string | undefined = locs?.[0]?.wide_shot
  if (!wideShot) throw new Error('법정 wide_shot 없음')
  const locDesc = (locs?.[0]?.visual_description as string) ?? null

  const jobs: Array<Record<string, unknown>> = []
  for (const a of ANGLES) {
    const cell = buildRoughGridCell(
      {
        shotType: a.shot_type,
        actionDescription: '',
        characterNames: [],
        location: 'courtroom',
        locationDescription: locDesc,
        timeOfDay: 'day',
        mood: null,
        spec: { staticSpec: specFor(a) },
      },
      a.key,
    )
    const prompt = buildRoughGridPrompt([cell], 'strip1')
    for (const arm of ['with_ref', 'no_ref'] as const) {
      const refs = arm === 'with_ref' ? [templateUrl, wideShot] : [templateUrl]
      const { request_id, model } = await falImageSubmit({
        model: DEFAULT_EDIT_IMAGE_MODEL,
        prompt,
        reference_image_urls: refs,
      })
      jobs.push({ key: `${a.key}__${arm}`, angle: a.key, label: a.label, visible_in_ref: a.visible_in_ref, arm, request_id, model, prompt, reference_image_urls: refs })
      console.log(`submitted ${a.key}__${arm}`)
    }
  }
  writeFileSync(PROV, JSON.stringify({ project_id: PROJECT_ID, location_id: LOCATION_ID, wide_shot: wideShot, template_url: templateUrl, jobs }, null, 2))

  // 수집 (인라인 폴링)
  let pending = jobs.filter((j) => !j.done)
  const deadline = Date.now() + 15 * 60_000
  while (pending.length && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 12_000))
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.model as string, { requestId: job.request_id as string, logs: false })
        if (st.status !== 'COMPLETED') continue
        const { data } = await fal.queue.result(job.model as string, { requestId: job.request_id as string })
        const url = (data as { images?: Array<{ url?: string }> })?.images?.[0]?.url
        if (!url) throw new Error('no image url')
        const dest = join(ASSETS, `${job.key}.png`)
        writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()))
        job.done = true
        job.image_url = url
        console.log(`done ${job.key}`)
      } catch (e) {
        console.error(`poll ${job.key}: ${(e as Error).message}`)
      }
    }
    writeFileSync(PROV, JSON.stringify({ project_id: PROJECT_ID, location_id: LOCATION_ID, wide_shot: wideShot, template_url: templateUrl, jobs }, null, 2))
    pending = jobs.filter((j) => !j.done)
  }
  console.log(`\ncollected ${jobs.length - pending.length}/${jobs.length}`)
}

await main()
