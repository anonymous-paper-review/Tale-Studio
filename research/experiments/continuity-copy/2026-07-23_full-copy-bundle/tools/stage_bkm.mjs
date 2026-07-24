#!/usr/bin/env node
// BKM팔 이미지 스테이징 — 27테이크 × (시작+끝) 프레임 생성, 영상 생성 직전 상태까지.
//   시작 프레임: 정본(identity_ref) + 빈 방 플레이트 + takes.json의 카메라·동작 텍스트 → gpt-image-2/edit
//   끝 프레임: 시작 프레임 참조 + "같은 카메라, 동작만 끝 상태" (입력 포맷 실험 검증 패턴)
//   산출: assets/arm-bkm/frames/T*_{start,end}.jpg · payloads.bkm.json (디스패처 i2v_se 잡)
//   resume: assets/bkm_state.json · 동시 3 · 상한 70콜
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fal } from '@fal-ai/client'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(EXP, '../../../..')
const A = path.join(EXP, 'assets')
const CANON = path.join(EXP, '../2026-07-23_character-canon/assets/identity_ref.jpg')
const WIDE = path.join(EXP, '../2026-07-23_input-format/assets/plates/src_empty_wide.jpg')
const STATE_PATH = path.join(A, 'bkm_state.json')
const MODEL = 'openai/gpt-image-2/edit'
const MAX_CALLS = 70
const CONC = 3
const DRY = process.env.PHASE === 'dry'

if (!process.env.FAL_KEY) {
  const m = /^FAL_KEY=(.+)$/m.exec(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8'))
  if (m) process.env.FAL_KEY = m[1].trim()
}
if (!DRY && !process.env.FAL_KEY) { console.error('FAL_KEY missing'); process.exit(1) }
if (!DRY) fal.config({ credentials: process.env.FAL_KEY })

const { takes } = JSON.parse(fs.readFileSync(path.join(EXP, 'takes.json'), 'utf8'))

// 테이크별 끝 상태 (시작 프레임 → 끝 프레임 편집 지시)
const END_STATE = {
  T01: 'Her face a little lower over the rim, eyes fixed down into the basin.',
  T02: 'She is fully bent forward, face near counter level, eyes down.',
  T03: 'Weight settled onto the other leg, skirt hem stilled.',
  T04: 'One heel lifted slightly, toe touching the tile.',
  T05: 'Her head turned a few degrees, checking the room in the mirror reflection.',
  T06: 'The lip-gloss wand raised near her lips, ready to apply.',
  T07: 'The gloss wand touching her lips, chin tilted slightly up.',
  T08: 'Wand lowered from her lips, her eyes on her own reflection.',
  T09: 'Nearly identical to the start, her weight shifted to the other leg.',
  T10: 'Her gaze arrived downward toward the sink below, brow slightly tense.',
  T11: 'Her face closer to the rim, eyes fixed downward.',
  T12: 'Unchanged — the drain identical, basin dry and empty, no water.',
  T13: 'Her ear closer to the faucet, hand still resting on the rim.',
  T14: 'Her face slightly closer over the basin, still peering down.',
  T15: 'She has moved one sink further left along the counter, mid-step stilled.',
  T16a: 'Her eyes shifted to one side, everything else frozen.',
  T16b: 'Crouched lower, head deeper below the counter line.',
  T17: 'One step further along the counter, feet settled.',
  T18: 'Unchanged — identical static pipes, no person.',
  T19a: 'The crown of her head lower over the basin, hair curtained further forward.',
  T19b: 'Same composition, everything frozen still.',
  T20a: 'Motionless, exactly as she lies, eyes closed.',
  T20b: 'The lying girl moved about a meter closer to the stalls, the standing girl mid-pull holding her arms.',
  T21: 'Unchanged — she lies motionless beside the toilet, eyes closed.',
  T22: 'She begins to rise from the toilet lid, shoes held in both hands.',
  T23: 'She has stepped fully out of the stall, one hand leaving the door.',
  T24: 'She is at the far edge of the frame near the exit; the room nearly empty.',
}
// 인물 없는 테이크 (정본 참조 불필요)
const NO_PERSON = new Set(['T12', 'T18'])

const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : { artifacts: {}, uploads: {} }
state.artifacts ??= {}; state.uploads ??= {}
const save = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
let calls = 0

async function upload(file) {
  const key = path.relative(EXP, file)
  if (state.uploads[key]) return state.uploads[key]
  const url = await fal.storage.upload(new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }))
  state.uploads[key] = url; save()
  return url
}
async function gen(id, refs, prompt, outRel) {
  const st = (state.artifacts[id] ??= {})
  const dest = path.join(A, outRel)
  if (st.url && fs.existsSync(dest)) return
  if (DRY) { console.log(`[dry] ${id}`); return }
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (calls >= MAX_CALLS) throw new Error(`call cap ${MAX_CALLS}`)
    calls++
    try {
      const image_urls = []
      for (const r of refs) image_urls.push(r.startsWith('http') ? r : await upload(r))
      const res = await fal.subscribe(MODEL, { input: { prompt, image_urls, image_size: 'landscape_16_9' } })
      const url = res.data?.images?.[0]?.url
      if (!url) throw new Error('no image url')
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()))
      st.url = url; save()
      console.log(`[ok] ${id} (calls=${calls})`)
      return
    } catch (e) {
      const msg = (e?.body?.detail?.[0]?.msg ?? e?.message ?? String(e)).slice(0, 110)
      console.error(`[fail] ${id} try${attempt}: ${msg}`)
      if (attempt === 2) { st.error = msg; save(); return } // 실패 기록 후 계속 (QC에서 재처리)
    }
  }
}
async function pool(jobs, n) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (i < jobs.length) { const j = jobs[i++]; await gen(j.id, j.refs, j.prompt, j.out) }
  }))
}

const startPrompt = (t) => {
  const who = NO_PERSON.has(t.id)
    ? 'No person in frame.'
    : t.two
      ? 'Reference image is the identity of BOTH identical girls (same face, hair, choker, pale blue satin slip dress).'
      : 'Reference 1 is the exact same young woman (identical face, black lip-length bob, silver charm choker, pale blue satin slip dress with daisy lace trim). Reference 2 is the actual empty restroom — match its materials, colors and lighting exactly.'
  return `Create a single photorealistic cinematic film frame (16:9). ${who} ${t.camera} Scene moment: ${t.action} ${t.event} Retro pastel public restroom: mint-green tiles, orange-red round sinks on a mint counter, large round mirrors with vertical tube lights, red-orange stall doors, warm fluorescent light. No on-screen text, no watermark.`
}
const endPrompt = (t) =>
  `Using the reference image as the start frame: keep the identical scene, identical camera position and framing, identical person(s), wardrobe and lighting. Change only the action state. End state: ${END_STATE[t.id]}`

const main = async () => {
  // 1) 시작 프레임 27 (병렬)
  console.log('=== 시작 프레임 27 ===')
  await pool(takes.map((t) => ({
    id: `${t.id}_start`,
    refs: NO_PERSON.has(t.id) ? [WIDE] : t.two ? [CANON] : [CANON, WIDE],
    prompt: startPrompt(t),
    out: `arm-bkm/frames/${t.id}_start.jpg`,
  })), CONC)
  // 2) 끝 프레임 27 (시작 의존, 병렬)
  console.log('=== 끝 프레임 27 ===')
  await pool(takes.filter((t) => state.artifacts[`${t.id}_start`]?.url).map((t) => ({
    id: `${t.id}_end`,
    refs: [state.artifacts[`${t.id}_start`].url],
    prompt: endPrompt(t),
    out: `arm-bkm/frames/${t.id}_end.jpg`,
  })), CONC)
  // 3) 페이로드 (i2v_se 잡 — 영상 발사 직전 상태)
  const jobs = takes.map((t) => ({
    id: `bkm_${t.id}`, task: 'i2v_se', prompt: t.video_prompt,
    image: `arm-bkm/frames/${t.id}_start.jpg`, end_image: `arm-bkm/frames/${t.id}_end.jpg`,
    seconds: t.secs, aspect: '16:9', out: `clips/arm-bkm/${t.id}.mp4`,
  }))
  fs.writeFileSync(path.join(EXP, 'jobs.bkm.json'), JSON.stringify(jobs, null, 2))
  const failed = Object.entries(state.artifacts).filter(([, v]) => v.error && !v.url).map(([k]) => k)
  console.log(`\njobs.bkm.json ${jobs.length}건 · 이번 실행 콜 ${calls} · 실패: ${failed.join(', ') || '없음'}`)
}
main().catch((e) => { save(); console.error('FATAL', e?.message ?? e); process.exit(1) })
