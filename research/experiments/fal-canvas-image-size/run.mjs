// fal image_size dict 실측 (#tfix-fal-wiring B안 검증, 2026-08-17)
// 가설: openai/gpt-image-2/edit 는 image_size 로 {width,height} 객체를 받는다 ('WxH' 문자열은 422 실측됨).
// 예측: T1/T2/T3 수락 + 출력 치수 = 요청 치수. T4(비네이티브 2.39:1)는 수락여부/스냅여부 관찰.
// 측정: submit → result 상태, 출력 PNG 실치수(sharp). 기각: T1 또는 T3 거부 → B안 기각, A안 회귀.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = '/home/user/Downloads/Tale-Studio'
const require = createRequire(path.join(repo, 'package.json'))
const { fal } = await import(
  path.join(repo, 'node_modules', '@fal-ai', 'client', 'dist', 'index.js')
).catch(() => require('@fal-ai/client'))
const sharp = require('sharp')

const env = await readFile(path.join(repo, '.env.local'), 'utf8')
const key = /^FAL_KEY=(.+)$/m.exec(env)?.[1]?.trim()
if (!key) throw new Error('FAL_KEY not found in .env.local')
fal.config({ credentials: key })

const parseRows = async (f) => JSON.parse(await readFile(path.join(here, f), 'utf8')).rows[0]
const grid = await parseRows('failed-job.json')
const strip = (await parseRows('strip-job.json')).fal_request

const MODEL = 'openai/gpt-image-2/edit'
const tests = [
  { id: 'T1-grid-landscape', prompt: grid.prompt, image_urls: grid.refs, size: { width: 1536, height: 1024 } },
  { id: 'T2-grid-portrait', prompt: grid.prompt, image_urls: grid.refs, size: { width: 1024, height: 1536 } },
  { id: 'T3-strip-portrait', prompt: strip.prompt, image_urls: strip.image_urls, size: { width: 1024, height: 1536 } },
  { id: 'T4-probe-239', prompt: grid.prompt, image_urls: grid.refs, size: { width: 1536, height: 643 } },
]

async function runOne(t) {
  try {
    const { request_id } = await fal.queue.submit(MODEL, {
      input: { prompt: t.prompt, image_urls: t.image_urls, image_size: t.size },
    })
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const s = await fal.queue.status(MODEL, { requestId: request_id, logs: false }).catch(() => null)
      if (!s) continue
      if (String(s.status).toUpperCase() === 'COMPLETED') break
      if (String(s.status).toUpperCase() === 'FAILED') return { id: t.id, ok: false, error: 'queue FAILED' }
    }
    let result
    try {
      result = await fal.queue.result(MODEL, { requestId: request_id })
    } catch (e) {
      const body = e?.body ? JSON.stringify(e.body).slice(0, 500) : String(e)
      return { id: t.id, ok: false, error: `status=${e?.status} ${body}` }
    }
    const url = result.data?.images?.[0]?.url ?? result.data?.image?.url
    if (!url) return { id: t.id, ok: false, error: 'no image url' }
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const out = path.join(here, `${t.id}.png`)
    await writeFile(out, buf)
    const meta = await sharp(buf).metadata()
    return { id: t.id, ok: true, requested: t.size, got: { width: meta.width, height: meta.height }, file: out }
  } catch (e) {
    const body = e?.body ? JSON.stringify(e.body).slice(0, 500) : ''
    return { id: t.id, ok: false, error: `${e?.status ?? ''} ${e?.message ?? e} ${body}`.trim() }
  }
}

const results = await Promise.all(tests.map(runOne))
console.log(JSON.stringify(results, null, 2))
