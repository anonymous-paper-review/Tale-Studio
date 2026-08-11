// 배경 플레이트 두 경로 생성 — 같은 목표물(이 샷 각도의 배경 판)을 서로 다른 방법으로 만든다.
//   i2i : 시작 그림에서 인물만 지운다 (3D 없음, 즉시 가능, 기하가 흐트러질 수 있음)
//   3d  : 서브에이전트가 렌더한 회색 블록아웃을 스타일 앵커·장소 와이드 참조로 칠한다
//   왜: HYPOTHESIS.md — 배경 유출의 원인이 "참조 장수"인지 "참조와 시작 그림의 불일치"인지 가른다.
//   범위: 이미지 생성 + 로컬 저장. DB 쓰기 없음, 제품 코드 수정 없음.
// 실행: pnpm dlx tsx research/experiments/previz-bg-plate-ab/plates.mts i2i|repaint|collect
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

const { fal } = await import('@fal-ai/client')
const { falImageSubmit } = await import('@/lib/writer/llm/fal')
const { resolveStyleAnchorByKey } = await import('@/lib/style-anchor')
const { supabaseAdmin } = await import('@/lib/supabase/admin')

fal.config({ credentials: process.env.FAL_KEY ?? '' })

const DIR = dirname(fileURLToPath(import.meta.url))
const PLATES = join(DIR, 'plates')
mkdirSync(PLATES, { recursive: true })
const STATE = join(PLATES, 'jobs.json')

const PROJECT_ID = 'c86410d7-6a6b-4e0e-9c8e-0e4a9a2a1f6f' // selection.json 에서 채운다(아래에서 덮어씀)
const SHOT = 'sh_04_19'

const SEL = JSON.parse(
  readFileSync(join(DIR, '..', 'previz-endframe-ab', 'run', 'selection.json'), 'utf8'),
) as { picked: Array<Record<string, unknown>> }
const P = SEL.picked.find((x) => x.shot_id === SHOT) as {
  project_id: string
  start: string
  characterViews: Array<{ views: Record<string, string> }>
  locationViews: Array<{ location_id: string; views: Record<string, string> }>
}
if (!P) throw new Error('선정 기록에서 샷을 못 찾았다')
void PROJECT_ID

const START_URL = P.start
const LOC_WIDE = P.locationViews.find((l) => l.views.wide_shot__url)?.views.wide_shot__url
if (!LOC_WIDE) throw new Error('장소 와이드 없음')

interface Job {
  route: 'i2i' | 'i2i2' | 'repaint'
  request_id: string
  model: string
  prompt: string
  reference_image_urls: string[]
  url?: string
  local?: string
  failed?: boolean
  error?: string
}
function readState(): { jobs: Job[] } {
  return existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { jobs: [] }
}

/** 인물만 지우고 나머지는 그대로 — 프레이밍·기하·빛을 건드리지 말라고 못박는다. */
const I2I_PROMPT =
  'Remove the person from this image completely, leaving the empty location behind. ' +
  'Keep everything else EXACTLY as it is: the same camera position and framing, the same tilted concrete slabs, ' +
  'the same scattered rubble, the same ruined buildings on the horizon, the same sky, the same light and the same drawing style. ' +
  'Fill the area where the person was with the ground and rubble that would naturally be behind her. ' +
  'Do not add any new object, figure, text or effect. This is a clean background plate of the same shot.'

/** 회색 블록아웃 → 이 장소의 룩으로. 기하는 블록아웃, 룩은 참조 두 장. */
const REPAINT_PROMPT =
  'The FIRST reference image is a grey untextured 3D blockout of a location: it defines the geometry, ' +
  'the camera angle and the layout — keep every shape exactly where it is, do not move, add or remove anything. ' +
  'Repaint it as a finished background plate of a ruined, sand-swept city: give the blocks the material of broken ' +
  'concrete slabs and rubble, add the ground and the sky, and match the art style, the line quality, the palette and ' +
  'the lighting mood of the OTHER reference images. No people, no characters, no text, no logos — this is an empty ' +
  'background plate.'

async function submit(route: 'i2i' | 'i2i2' | 'repaint') {
  const st = readState()
  if (st.jobs.some((j) => j.route === route)) {
    console.log(`skip ${route} — 이미 발주됨`)
    return
  }
  let refs: string[]
  let prompt: string
  if (route === 'i2i') {
    refs = [START_URL]
    prompt = I2I_PROMPT
  } else if (route === 'i2i2') {
    // 1차 i2i 는 기하는 살렸지만 화풍이 깨졌다(잉크 에칭풍으로 이탈) — 플레이트가 시작 그림과
    //   '공간은 같고 룩은 다른' 물건이 되면 정합 가설을 못 잰다. 화풍 앵커를 참조로 덧대 재시도.
    const { data: proj } = await supabaseAdmin
      .from('projects')
      .select('style_anchor_key')
      .eq('id', P.project_id)
      .maybeSingle()
    const anchor = await resolveStyleAnchorByKey((proj?.style_anchor_key as string | null) ?? null)
    refs = [START_URL, ...(anchor ? [anchor.imageUrl] : [])]
    prompt = `${I2I_PROMPT} The last reference image sets the visual style ONLY — match its medium, its line quality, its shading and its colour grade exactly; do not reproduce its subject.`
  } else {
    const grey = join(PLATES, 'blockout_grey.png')
    if (!existsSync(grey)) throw new Error(`회색 렌더 없음: ${grey} — 3D 서브에이전트 산출을 기다린다`)
    // fal storage 로 올려 URL 확보(로컬 파일은 모델이 못 읽는다)
    const buf = readFileSync(grey)
    const url = await fal.storage.upload(new File([new Uint8Array(buf)], 'blockout_grey.png', { type: 'image/png' }))
    const { data: proj } = await supabaseAdmin
      .from('projects')
      .select('style_anchor_key')
      .eq('id', P.project_id)
      .maybeSingle()
    const anchor = await resolveStyleAnchorByKey((proj?.style_anchor_key as string | null) ?? null)
    refs = [url, LOC_WIDE!, ...(anchor ? [anchor.imageUrl] : [])]
    prompt = REPAINT_PROMPT
  }
  const { request_id, model } = await falImageSubmit({
    prompt,
    reference_image_urls: refs,
    aspect_ratio: route === 'repaint' ? '16:9' : '3:2',
  } as never)
  st.jobs.push({ route, request_id, model, prompt, reference_image_urls: refs })
  writeFileSync(STATE, JSON.stringify(st, null, 2))
  console.log(`submitted ${route} → ${request_id} (refs ${refs.length})`)
}

async function collect() {
  const st = readState()
  const deadline = Date.now() + 20 * 60_000
  let pending = st.jobs.filter((j) => !j.url && !j.failed)
  while (pending.length && Date.now() < deadline) {
    for (const j of pending) {
      const s = await fal.queue.status(j.model, { requestId: j.request_id, logs: false })
      if (s.status !== 'COMPLETED') {
        console.log(`... ${j.route}: ${s.status}`)
        continue
      }
      try {
        const { data } = await fal.queue.result(j.model, { requestId: j.request_id })
        const url = (data as { images?: Array<{ url?: string }> })?.images?.[0]?.url
        if (!url) throw new Error(`no image url: ${JSON.stringify(data).slice(0, 200)}`)
        j.url = url
        const dest = join(PLATES, `plate_${j.route}.png`)
        writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()))
        j.local = dest
        console.log(`done ${j.route} → ${dest}`)
      } catch (e) {
        j.failed = true
        j.error = String((e as Error).message ?? e)
        console.error(`FAILED ${j.route}: ${j.error.slice(0, 200)}`)
      }
    }
    writeFileSync(STATE, JSON.stringify(st, null, 2))
    pending = st.jobs.filter((j) => !j.url && !j.failed)
    if (pending.length) await new Promise((r) => setTimeout(r, 15_000))
  }
  writeFileSync(STATE, JSON.stringify(st, null, 2))
  console.log(`plates: ${st.jobs.filter((j) => j.url).map((j) => j.route).join(', ') || '없음'}`)
}

const mode = process.argv[2]
if (mode === 'i2i') await submit('i2i')
else if (mode === 'i2i2') await submit('i2i2')
else if (mode === 'repaint') await submit('repaint')
else if (mode === 'collect') await collect()
else throw new Error('usage: plates.mts i2i|i2i2|repaint|collect')
