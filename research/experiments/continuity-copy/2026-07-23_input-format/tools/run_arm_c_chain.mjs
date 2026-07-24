#!/usr/bin/env node
// C팔 클러스터 체이닝 실행기 (blueprint-c) — 순차 전용.
//   샷 1·3·4: B1 클립 재사용 (입력 동일 → 재생성은 중복 과금 + 무관 확률 변동만 추가.
//             재사용이 "B1 vs C = 체이닝 샷 차이만"으로 변수를 완벽 격리한다)
//   샷 2·5·6: 앞 샷 클립의 실물 마지막 프레임 → 편집 모델(gpt-image-2/edit, 정본 동반) → 시작 프레임
//             → (시작, B1 끝 프레임) i2v_se(Seedance 2.0, 힉스필드 레인 — fal은 포토리얼 얼굴 차단).
//   체인 의존: s2 ← s1 클립 · s5 ← s4 클립 · s6 ← s5 클립(생성 순서 강제).
//   resume: assets/gen_state.json 의 c_* 키 재사용. FAL_KEY는 편집 모델용(.env.local 자동 로드).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { fal } from '@fal-ai/client'

const pexec = promisify(execFile)
const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(EXP, '../../../..')
const A = path.join(EXP, 'assets')
const CANON = path.join(EXP, '../2026-07-23_character-canon/assets/identity_ref.jpg')
const STATE_PATH = path.join(A, 'gen_state.json')
const EDIT_MODEL = 'openai/gpt-image-2/edit'

if (!process.env.FAL_KEY) {
  const m = /^FAL_KEY=(.+)$/m.exec(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8'))
  if (m) process.env.FAL_KEY = m[1].trim()
}
if (!process.env.FAL_KEY) { console.error('FAL_KEY missing (편집 모델용)'); process.exit(1) }
fal.config({ credentials: process.env.FAL_KEY })

const payloads = JSON.parse(fs.readFileSync(path.join(A, 'payloads/payloads.json'), 'utf8'))
const cShots = payloads.arms.c.shots
const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {}
const save = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
const rel = (p) => path.join(A, p.replace(/^assets\//, ''))

fs.mkdirSync(path.join(A, 'clips/arm-c'), { recursive: true })
fs.mkdirSync(path.join(A, 'arm-c/frames'), { recursive: true })

// ── 1) 설계 샷 1·3·4: B1 클립 복사 ──
for (const n of [1, 3, 4]) {
  const src = path.join(A, `clips/arm-b1/s${n}.mp4`)
  const dst = path.join(A, `clips/arm-c/s${n}.mp4`)
  if (!fs.existsSync(src)) { console.error(`B1 클립 미완: s${n} — 배치 완료 후 재실행`); process.exit(1) }
  if (!fs.existsSync(dst)) { fs.copyFileSync(src, dst); console.log(`[copy] b1 s${n} → arm-c`) }
  state[`c_s${n}`] ??= { done: true, provider: 'reuse-b1', out: `clips/arm-c/s${n}.mp4`, note: 'B1 클립 재사용 (입력 동일)' }
}
save()

// ── helpers ──
function lastFrame(clipRel, outRel) {
  const outAbs = path.join(A, outRel)
  // 마지막 프레임: 끝 0.2초 지점부터 마지막 1프레임만
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-sseof', '-0.2', '-i', path.join(A, clipRel), '-vsync', '0', '-update', '1', '-q:v', '2', outAbs])
  return outAbs
}
async function editStart(id, refs, prompt, outRel) {
  const outAbs = path.join(A, outRel)
  if (state[id]?.done && fs.existsSync(outAbs)) { console.log(`[skip] ${id}`); return }
  const urls = []
  for (const r of refs) urls.push(await fal.storage.upload(new Blob([fs.readFileSync(r)], { type: 'image/jpeg' })))
  const res = await fal.subscribe(EDIT_MODEL, { input: { prompt, image_urls: urls, image_size: 'landscape_16_9' } })
  const url = res.data?.images?.[0]?.url
  if (!url) throw new Error(`${id}: 편집 결과 없음`)
  fs.writeFileSync(outAbs, Buffer.from(await (await fetch(url)).arrayBuffer()))
  state[id] = { done: true, provider: 'fal', model: EDIT_MODEL, out: outRel, url, ts: new Date().toISOString() }
  save()
  console.log(`[edit ok] ${id} → ${outRel}`)
}
function deepFindUrl(node) {
  if (typeof node === 'string') return /^https?:\/\/.+\.(mp4|mov|webm)(\?|$)/i.test(node) ? node : null
  if (Array.isArray(node)) { for (const v of node) { const u = deepFindUrl(v); if (u) return u } }
  else if (node && typeof node === 'object') {
    if (typeof node.result_url === 'string') return node.result_url
    for (const v of Object.values(node)) { const u = deepFindUrl(v); if (u) return u }
  }
  return null
}
async function hfVideo(id, startRel, endRel, prompt, seconds, outRel) {
  const outAbs = path.join(A, outRel)
  if (state[id]?.done && fs.existsSync(outAbs)) { console.log(`[skip] ${id}`); return }
  const secs = Math.min(15, Math.max(4, Math.round(seconds)))
  const args = ['generate', 'create', 'seedance_2_0', '--prompt', prompt,
    '--start-image', path.join(A, startRel), '--end-image', path.join(A, endRel),
    '--duration', String(secs), '--resolution', '720p', '--aspect_ratio', '16:9',
    '--json', '--wait', '--wait-timeout', '20m', '--wait-interval', '5s']
  // 503·nsfw가 확률적으로 뜬다(배치에서 재시도 통과 실증) — 3회 백오프 재시도
  let stdout
  for (let attempt = 1; ; attempt++) {
    try { ;({ stdout } = await pexec('higgsfield', args, { maxBuffer: 128 * 1024 * 1024 })); break }
    catch (e) {
      const msg = (e.stderr || e.message || '').toString().slice(0, 120)
      if (attempt >= 3) throw new Error(`${id}: 3회 실패 — ${msg}`)
      console.error(`[retry ${attempt}] ${id}: ${msg}`)
      await new Promise((r) => setTimeout(r, 15000 * attempt))
    }
  }
  const parsed = JSON.parse(stdout)
  const jobObj = Array.isArray(parsed) ? parsed[0] : parsed
  const url = (typeof jobObj?.result_url === 'string' ? jobObj.result_url : null) ?? deepFindUrl(parsed)
  if (!url) throw new Error(`${id}: result_url 없음`)
  fs.writeFileSync(outAbs, Buffer.from(await (await fetch(url)).arrayBuffer()))
  state[id] = { done: true, provider: 'higgsfield', model: 'seedance_2_0', task: 'i2v_se', out: outRel, url, jobId: jobObj?.id ?? null, seconds: secs, ts: new Date().toISOString() }
  save()
  console.log(`[hf ok] ${id} (${secs}s) → ${outRel}`)
}

// ── 2) 체인 샷 2·5·6 순차 ──
for (const shot of cShots.filter((s) => s.chain)) {
  const n = shot.shot
  const from = shot.chain.from_shot_clip
  const fromClip = `clips/arm-c/s${from}.mp4`
  if (!fs.existsSync(path.join(A, fromClip))) { console.error(`체인 원천 클립 미완: s${from} — 먼저 생성 필요`); process.exit(1) }
  console.log(`--- c_s${n} (체인 ← s${from}) ---`)
  const frameRel = `arm-c/frames/s${n}_chain_src.jpg`
  lastFrame(fromClip, frameRel)
  const startRel = `arm-c/frames/s${n}_start.jpg`
  await editStart(`c_s${n}_start`, [path.join(A, frameRel), CANON],
    `Reference 1 is the final movie frame of the previous shot; reference 2 is the character identity reference (same woman). ${shot.chain.chain_prompt} Cinematic fashion-film still, photorealistic, 16:9. No on-screen text, no watermark.`,
    startRel)
  await hfVideo(`c_s${n}`, startRel, rel(shot.end_image).slice(A.length + 1), shot.video_prompt, shot.duration_s, `clips/arm-c/s${n}.mp4`)
}
console.log('arm-c done')
