#!/usr/bin/env node
// fal 차단 원인 격자 프로브 (오너 반박 2026-07-23: "fal로 실존인물 영상 DB에 많다 — 프롬프트 문제 아니냐")
//   기존 프로브 2콜은 프롬프트를 고정한 채 이미지만 바꿔서 교란 상태였다. 변수를 분해해 다시 잰다.
//
// 가설:
//   H1 얼굴-이미지: 포토리얼 얼굴이 이미지에 있으면 차단 (프롬프트 무관)
//   H2 프롬프트: 인물 묘사 프롬프트가 차단 유발 (중립 프롬프트면 같은 이미지도 통과)
//   H3 파트너 정책: 차단은 Seedance(바이트댄스) 한정 — happy_horse(알리바바)는 같은 이미지 통과
//      (과거 DB의 실존인물 영상 성공은 happy_horse였다는 설명과 정합)
//   H4 포토리얼 문턱: 애니/일러스트 인물은 통과
//   H5 얼굴 크기: 인물이 극소(와이드)면 통과
//
// 비용: 차단(422)은 과금 전 검증 실패라 무료로 추정. 통과 시 4초 480p ~$0.5/건. 최대 8콜.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fal } from '@fal-ai/client'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(EXP, '../../../..')
const A = path.join(EXP, 'assets')
const OUT = path.join(A, 'probe-fal')
fs.mkdirSync(OUT, { recursive: true })

if (!process.env.FAL_KEY) {
  const m = /^FAL_KEY=(.+)$/m.exec(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8'))
  if (m) process.env.FAL_KEY = m[1].trim()
}
fal.config({ credentials: process.env.FAL_KEY })

const SEEDANCE = 'bytedance/seedance-2.0/image-to-video'
const HORSE = 'alibaba/happy-horse/reference-to-video'
const NEUTRAL = 'Gentle ambient motion. Static camera.'
const payloads = JSON.parse(fs.readFileSync(path.join(A, 'payloads/payloads.json'), 'utf8'))
const FULL_PROMPT = payloads.arms.b1.shots[0].video_prompt // 인물 묘사 3층 계약 원문

const up = async (p) => fal.storage.upload(new Blob([fs.readFileSync(p)]))

async function anime() {
  // H4용 애니 인물 즉석 생성 (t2i 1콜)
  const dest = path.join(OUT, 'anime_girl.jpg')
  if (fs.existsSync(dest)) return dest
  const r = await fal.subscribe('fal-ai/flux-2/klein/9b', { input: {
    prompt: 'flat 2D anime illustration, cel shading, thick outlines: a girl with black bob hair applying lip gloss in front of a round mirror in a retro mint-green bathroom. Stylized cartoon, not photorealistic.',
    image_size: 'landscape_16_9' } })
  const u = r.data?.images?.[0]?.url
  fs.writeFileSync(dest, Buffer.from(await (await fetch(u)).arrayBuffer()))
  console.log('[prep] anime_girl.jpg 생성')
  return dest
}

async function probe(name, model, imgPath, prompt, endPath = null) {
  try {
    const input = model === SEEDANCE
      ? { prompt, image_url: await up(imgPath), duration: '4', resolution: '480p', aspect_ratio: '16:9' }
      : { prompt, image_urls: [await up(imgPath)], duration: 3, aspect_ratio: '16:9' }
    if (endPath && model === SEEDANCE) input.end_image_url = await up(endPath)
    const r = await fal.subscribe(model, { input, logs: false })
    const u = r.data?.video?.url
    if (u) fs.writeFileSync(path.join(OUT, `${name}.mp4`), Buffer.from(await (await fetch(u)).arrayBuffer()))
    return { name, result: 'PASS', detail: u ? 'video saved' : 'no url?' }
  } catch (e) {
    const d = e?.body?.detail?.[0]
    return { name, result: 'BLOCK', detail: `${e?.status ?? '?'} ${d?.type ?? ''} @${(d?.loc ?? []).join('.')} — ${(d?.msg ?? e?.message ?? '').slice(0, 90)}` }
  }
}

const CANON_AI_FACE = path.join(A, 'arm-b1/frames/s1_start.jpg')   // 생성 포토리얼 얼굴
const REAL_FACE = path.join(A, 'conti/s1_start.jpg')               // 실존 인물 원본 프레임
const NO_PERSON = path.join(A, 'conti/s6_start.jpg')               // 원본 프레임, 인물 없음(배수구)
const TINY_PERSON = path.join(A, 'conti/s3_start.jpg')             // 원본 와이드, 인물 극소
const END_AI = path.join(A, 'arm-b1/frames/s1_end.jpg')

const results = []
const run = async (...args) => { const r = await probe(...args); console.log(`${r.result}  ${r.name}  ${r.detail}`); results.push(r) }

console.log('=== fal 정책 프로브 (모델 × 이미지 × 프롬프트) ===')
await run('1_seedance_noperson_neutral', SEEDANCE, NO_PERSON, 'Static shot of the sink drain, subtle light shimmer.')
await run('2_seedance_aiface_neutral', SEEDANCE, CANON_AI_FACE, NEUTRAL)
await run('3_seedance_aiface_fullprompt', SEEDANCE, CANON_AI_FACE, FULL_PROMPT)
await run('4_seedance_realface_neutral', SEEDANCE, REAL_FACE, NEUTRAL)
await run('5_seedance_tinyperson_neutral', SEEDANCE, TINY_PERSON, NEUTRAL)
await run('6_seedance_anime_neutral', SEEDANCE, await anime(), NEUTRAL)
await run('7_horse_realface_neutral', HORSE, REAL_FACE, NEUTRAL)
// 8: 2가 통과했을 때만 의미 — end_image 추가 효과
if (results.find((r) => r.name.startsWith('2_') && r.result === 'PASS'))
  await run('8_seedance_aiface_neutral_endimg', SEEDANCE, CANON_AI_FACE, NEUTRAL, END_AI)

fs.writeFileSync(path.join(OUT, 'probe_results.json'), JSON.stringify(results, null, 2))
console.log('\n=== 요약 ===')
for (const r of results) console.log(`${r.result.padEnd(6)} ${r.name}`)
