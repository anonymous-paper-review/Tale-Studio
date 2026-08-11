// 참조 이미지가 러프 그림에서 "같은 방"을 붙잡는가 — HYPOTHESIS.md 의 측정 절차.
//   재현성 3규칙: 제품 buildRoughGridCell/buildRoughGridPrompt/falImageSubmit/deriveEnBatch 를
//   그대로 import(복붙 없음). 입력은 Sample1 법정 판사석 3샷으로 고정.
//   팔 차이는 reference_image_urls 배열 단 하나 — A=[템플릿], B=[템플릿, 법정 wide_shot].
// 실행: pnpm dlx tsx research/experiments/rough-background-ref-holds-room/probe.mts submit|collect
import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

import { fal } from '@fal-ai/client'
import type { ShotStaticSpec } from '@/lib/writer/types/pipeline'

// 제품 모듈은 **동적 import** — supabaseAdmin 등이 로드 시점에 env 를 읽는데, 정적 import 는
//   호이스팅돼 위 config() 보다 먼저 평가된다(실측: NEXT_PUBLIC_SUPABASE_URL undefined 로 크래시).
const { buildRoughGridCell, buildRoughGridPrompt, STRIP_TEMPLATE_PATH } = await import(
  '@/lib/writer/rough-storyboard-grid'
)
const { DEFAULT_EDIT_IMAGE_MODEL, falImageSubmit } = await import('@/lib/writer/llm/fal')
const { deriveEnBatch } = await import('@/lib/writer/i18n/derive-en')

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const RAW = join(DIR, 'raw')
const ASSETS = join(DIR, 'assets')
const PROV = join(DIR, 'provenance.json')

const PROJECT_ID = '9d6efa6d-3216-40b0-8a2c-184ab56f02ec' // Sample1 (법정 드라마)
const LOCATION_ID = 'location' // 법정
const SHOT_IDS = ['sh_06_39', 'sh_07_49', 'sh_09_67'] // 판사석 정면 WS/eye_level, 씬 6·7·9

async function db() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function submit() {
  mkdirSync(RAW, { recursive: true })
  mkdirSync(ASSETS, { recursive: true })
  const supa = await db()

  // 템플릿 URL 확보 — 프로덕션 경로(공개 base URL) 우선, 터널이 내려가 있으면 같은 파일을
  //   스토리지에 업로드해 사용(바이트 동일, 호스트만 다름 — result.md 에 어느 경로를 썼는지 기록).
  const baseUrl = (process.env.WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  let templateUrl = baseUrl ? `${baseUrl}${STRIP_TEMPLATE_PATH}` : ''
  let templateSource = 'app_public'
  const reachable = templateUrl
    ? await fetch(templateUrl, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)
    : false
  if (!reachable) {
    const local = readFileSync(join(DIR, '../../../public', STRIP_TEMPLATE_PATH.replace(/^\//, '')))
    const path = `research/rough-background-ref-holds-room${STRIP_TEMPLATE_PATH}`
    const { error: upErr } = await supa.storage
      .from('media')
      .upload(path, local, { contentType: 'image/png', upsert: true })
    if (upErr) throw upErr
    templateUrl = supa.storage.from('media').getPublicUrl(path).data.publicUrl
    templateSource = 'storage_upload'
    console.log(`템플릿 폴백 — 스토리지 업로드 사용: ${templateUrl}`)
  }

  const [{ data: shots, error: se }, { data: locs, error: le }, { data: scenes }, { data: chars }] =
    await Promise.all([
      supa.from('shots').select('*').eq('project_id', PROJECT_ID).in('shot_id', SHOT_IDS),
      supa.from('locations').select('*').eq('project_id', PROJECT_ID).eq('location_id', LOCATION_ID),
      supa.from('scenes').select('*').eq('project_id', PROJECT_ID),
      supa.from('characters').select('character_id, name').eq('project_id', PROJECT_ID),
    ])
  if (se) throw se
  if (le) throw le
  const loc = locs?.[0]
  const wideShot: string | undefined = loc?.wide_shot
  if (!wideShot) throw new Error(`법정 wide_shot 없음 — 처치군 성립 불가(실험 중단)`)
  if (shots?.length !== SHOT_IDS.length) throw new Error(`샷 ${SHOT_IDS.length}개 중 ${shots?.length} 개만 조회됨`)

  const nameById = new Map((chars ?? []).map((c) => [c.character_id as string, c.name as string]))
  const sceneById = new Map((scenes ?? []).map((s) => [(s.scene_id ?? s.id) as string, s]))

  // 언어 경계는 제품 함수로 (이미 영어면 LLM skip — 라우트와 동일 처리)
  const locLabelEn = (await deriveEnBatch([{ id: LOCATION_ID, native: (loc.name as string) ?? '' }], 'location place label')).get(LOCATION_ID)
  const actionEn = await deriveEnBatch(
    shots!.map((s) => ({ id: s.shot_id as string, native: (s.action_description as string) ?? '' })),
    'shot action description',
  )
  const nameEn = await deriveEnBatch(
    [...nameById.entries()].map(([id, n]) => ({ id, native: n })),
    'character name (transliterate to Latin)',
  )
  const nameEnMap = new Map([...nameById.entries()].map(([id, n]) => [id, nameEn.get(id) ?? n]))

  const jobs: Array<Record<string, unknown>> = []
  for (const shotId of SHOT_IDS) {
    const s = shots!.find((x) => x.shot_id === shotId)!
    const scene = sceneById.get(s.scene_id as string)
    const camera = (s.camera_config ?? {}) as { pan?: number }
    const lighting = (s.lighting_config ?? {}) as { position?: string }
    const staticSpec = (s.static_spec ?? null) as ShotStaticSpec | null

    const cell = buildRoughGridCell(
      {
        shotType: (s.shot_type as string) ?? 'MS',
        actionDescription: actionEn.get(shotId) ?? (s.action_description as string) ?? '',
        characterNames: ((s.characters as string[]) ?? []).map((id) => nameEnMap.get(id) ?? id),
        characterNameById: nameEnMap,
        location: locLabelEn ?? (loc.name as string),
        locationDescription: (loc.visual_description as string) ?? null,
        timeOfDay: (scene?.time_of_day as string) ?? null,
        mood: (scene?.mood as string) ?? null,
        cameraPitch: camera.pan ?? null,
        focalLength: (s.focal_length as number | null) ?? null,
        aperture: (s.aperture as number | null) ?? null,
        lightPosition: lighting.position ?? null,
        durationSeconds: (s.duration_seconds as number | null) ?? null,
        spec: staticSpec ? { staticSpec } : null,
      },
      shotId,
    )
    const prompt = buildRoughGridPrompt([cell], 'strip1')

    for (const arm of ['A_control', 'B_location_ref'] as const) {
      const refs = arm === 'A_control' ? [templateUrl] : [templateUrl, wideShot]
      const { request_id, model, fal_request } = await falImageSubmit({
        model: DEFAULT_EDIT_IMAGE_MODEL,
        prompt,
        reference_image_urls: refs,
      })
      jobs.push({
        key: `${shotId}__${arm}`,
        shot_id: shotId,
        arm,
        request_id,
        model,
        prompt,
        reference_image_urls: refs,
        fal_request,
        submitted_at: new Date().toISOString(),
      })
      console.log(`submitted ${shotId}__${arm} → ${request_id}`)
    }
  }
  writeFileSync(PROV, JSON.stringify({ project_id: PROJECT_ID, location_id: LOCATION_ID, template_url: templateUrl, template_source: templateSource, wide_shot: wideShot, jobs }, null, 2))
  console.log(`\n${jobs.length} jobs → ${PROV}`)
}

async function collect() {
  const prov = JSON.parse(readFileSync(PROV, 'utf8'))
  let pending = prov.jobs.filter((j: { done?: boolean }) => !j.done)
  const deadline = Date.now() + 15 * 60_000
  while (pending.length && Date.now() < deadline) {
    for (const job of pending) {
      try {
        const st = await fal.queue.status(job.model, { requestId: job.request_id, logs: false })
        if (st.status === 'COMPLETED') {
          const { data } = await fal.queue.result(job.model, { requestId: job.request_id })
          const url = (data as { images?: Array<{ url?: string }> })?.images?.[0]?.url
          if (!url) throw new Error(`no image url: ${JSON.stringify(data).slice(0, 200)}`)
          const dest = join(ASSETS, `${job.key}.png`)
          const res = await fetch(url)
          writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
          job.done = true
          job.image_url = url
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
    if (pending.length) await new Promise((r) => setTimeout(r, 15_000))
  }
  console.log(`\ncollected ${prov.jobs.length - pending.length}/${prov.jobs.length}`)
  if (pending.length) process.exitCode = 1
}

const mode = process.argv[2]
if (mode === 'submit') await submit()
else if (mode === 'collect') await collect()
else throw new Error('usage: probe.mts submit|collect')
