#!/usr/bin/env node
// E9d-proto 이미지·영상 생성 (재현용). 제품 실배선(src/lib/writer/llm/fal.ts)의 fal 입력 조립을
//   그대로 복제한다 — 모델 id·입력 스키마 동일. 새 로직 아님, 하네스 밖 오케스트레이션.
//     T2I: fal-ai/flux-2/klein/9b  input={prompt, image_size:'landscape_16_9', seed}  (flux 계열: aspect_ratio 대신 image_size, seed 지원)
//     I2V: alibaba/happy-horse/reference-to-video (제품 DEFAULT_VIDEO_MODEL)  input={prompt, image_urls:[url], duration(int 3~15), aspect_ratio:'16:9'}
//   생성 상한: T2I ≤ 25, I2V ≤ 22 (재시도 포함). 전역 카운터로 강제.
//   resume: gen_state.json에 image_url/video_url 캐시 — 재실행 시 이미 된 건 skip(과금 방지).
//   PHASE=images|videos|all (기본 all). 키는 절대 로그로 출력하지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { fal } from '@fal-ai/client'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'research', 'experiments', 'continuity-copy', '2026-07-23_laundromat-proto', 'assets')
const SHOTS_DIR = path.join(OUT_DIR, 'shots')
const CLIPS_DIR = path.join(OUT_DIR, 'clips')
const STATE_PATH = path.join(OUT_DIR, 'gen_state.json')
const LOG_PATH = path.join(OUT_DIR, 'generation_log.json')

const PHASE = process.env.PHASE ?? 'all'
const T2I_MODEL = 'fal-ai/flux-2/klein/9b'
const I2V_MODEL = 'alibaba/happy-horse/reference-to-video'
const T2I_CAP = 25
const I2V_CAP = 22
const IMG_CONCURRENCY = 4
const VID_CONCURRENCY = 3

if (!process.env.FAL_KEY) { console.error('FAL_KEY not set'); process.exit(1) }
fal.config({ credentials: process.env.FAL_KEY })

const shotplan = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'shotplan.json'), 'utf8'))
const shots = shotplan.shots
const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {}
for (const s of shots) state[s.shot_id] = state[s.shot_id] ?? {}

const counts = { t2i_attempts: 0, t2i_success: 0, t2i_fail: 0, i2v_attempts: 0, i2v_success: 0, i2v_fail: 0 }
const saveState = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  return buf.length
}

// ── worker pool (전역 카운터 가드로 상한 강제) ──
async function pool(items, concurrency, fn) {
  let idx = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const my = idx++
      await fn(items[my])
    }
  })
  await Promise.all(workers)
}

// ── Phase D: T2I ──
async function genImage(shot) {
  const st = state[shot.shot_id]
  if (st.image_url && fs.existsSync(path.join(SHOTS_DIR, `${shot.shot_id}.jpg`))) return
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (counts.t2i_attempts >= T2I_CAP) { console.error(`[T2I] cap ${T2I_CAP} reached — skip ${shot.shot_id}`); return }
    counts.t2i_attempts++
    try {
      const input = { prompt: shot.first_frame_prompt, image_size: 'landscape_16_9', seed: shot.seed }
      const r = await fal.subscribe(T2I_MODEL, { input, logs: false })
      const url = r?.data?.images?.[0]?.url
      if (!url) throw new Error('no image url')
      const bytes = await download(url, path.join(SHOTS_DIR, `${shot.shot_id}.jpg`))
      st.image_url = url
      st.image_bytes = bytes
      counts.t2i_success++
      saveState()
      console.log(`[T2I ok] ${shot.shot_id} (${bytes}B) attempts=${counts.t2i_attempts}`)
      return
    } catch (e) {
      const msg = (e?.message ?? String(e)).slice(0, 120)
      console.error(`[T2I fail] ${shot.shot_id} try${attempt}: ${msg}`)
      if (attempt === 2) counts.t2i_fail++
    }
  }
}

// ── Phase E: I2V ──
async function genVideo(shot) {
  const st = state[shot.shot_id]
  if (st.video_url && fs.existsSync(path.join(CLIPS_DIR, `${shot.shot_id}.mp4`))) return
  if (!st.image_url) { console.error(`[I2V] ${shot.shot_id} has no image — skip`); return }
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (counts.i2v_attempts >= I2V_CAP) { console.error(`[I2V] cap ${I2V_CAP} reached — skip ${shot.shot_id}`); return }
    counts.i2v_attempts++
    try {
      const input = { prompt: shot.motion_prompt, image_urls: [st.image_url], duration: shot.video_request_seconds, aspect_ratio: '16:9' }
      const r = await fal.subscribe(I2V_MODEL, { input, logs: false })
      const url = r?.data?.video?.url
      if (!url) throw new Error('no video url')
      const bytes = await download(url, path.join(CLIPS_DIR, `${shot.shot_id}.mp4`))
      st.video_url = url
      st.video_bytes = bytes
      st.video_request_seconds = shot.video_request_seconds
      counts.i2v_success++
      saveState()
      console.log(`[I2V ok] ${shot.shot_id} (${bytes}B, req=${shot.video_request_seconds}s) attempts=${counts.i2v_attempts}`)
      return
    } catch (e) {
      const msg = (e?.message ?? String(e)).slice(0, 120)
      console.error(`[I2V fail] ${shot.shot_id} try${attempt}: ${msg}`)
      if (attempt === 2) counts.i2v_fail++
    }
  }
}

const main = async () => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
  fs.mkdirSync(CLIPS_DIR, { recursive: true })
  if (PHASE === 'images' || PHASE === 'all') {
    console.log(`=== Phase D: T2I (${shots.length} shots, cap ${T2I_CAP}) ===`)
    await pool(shots, IMG_CONCURRENCY, genImage)
  }
  if (PHASE === 'videos' || PHASE === 'all') {
    console.log(`=== Phase E: I2V (cap ${I2V_CAP}) ===`)
    await pool(shots, VID_CONCURRENCY, genVideo)
  }
  saveState()
  const missingImg = shots.filter((s) => !state[s.shot_id].image_url).map((s) => s.shot_id)
  const missingVid = shots.filter((s) => !state[s.shot_id].video_url).map((s) => s.shot_id)
  const log = { run: shotplan.run, counts, total_shots: shots.length, missing_images: missingImg, missing_videos: missingVid }
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2))
  console.log('\n=== generation_log ===')
  console.log(JSON.stringify(counts))
  console.log(`missing images: ${missingImg.join(',') || 'none'}`)
  console.log(`missing videos: ${missingVid.join(',') || 'none'}`)
}
main().catch((e) => { console.error('FATAL', e?.message ?? e); saveState(); process.exit(1) })
