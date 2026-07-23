// fal 레인 어댑터. 기존 실험 스크립트(e9dp_generate.mjs)의 fal.subscribe 호출을 일반화한 것.
// FAL_KEY 필요. 로컬 이미지 입력은 fal.storage 로 업로드해 URL로 넘긴다.
import fs from 'node:fs'
import path from 'node:path'
import { fal } from '@fal-ai/client'
import { MODELS, falImageSize } from '../models.mjs'

let configured = false
function ensure() {
  if (configured) return
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY not set')
  fal.config({ credentials: process.env.FAL_KEY })
  configured = true
}

// 로컬 경로/URL → fal이 먹는 URL
async function toUrl(imageRef, assetsDir) {
  if (/^https?:\/\//.test(imageRef)) return imageRef
  const p = path.isAbsolute(imageRef) ? imageRef : path.join(assetsDir, imageRef)
  const buf = fs.readFileSync(p)
  return await fal.storage.upload(new Blob([buf]))
}

// job → { url, model, meta }.  실패는 throw (디스패처가 재시도/카운트 처리).
export async function run(job, { assetsDir }) {
  ensure()
  const spec = MODELS.fal[job.task]
  if (!spec) throw new Error(`fal: task '${job.task}' 미지원`)
  const model = spec.model
  let input
  if (job.task === 't2i') {
    input = { prompt: job.prompt, image_size: falImageSize(job.aspect) }
    if (job.seed != null) input.seed = job.seed
  } else if (job.task === 'edit') {
    input = { prompt: job.prompt, image_urls: [await toUrl(job.image, assetsDir)] }
  } else if (job.task === 'i2v') {
    input = {
      prompt: job.prompt,
      image_urls: [await toUrl(job.image, assetsDir)],
      duration: job.seconds ?? 5,
      aspect_ratio: job.aspect ?? '16:9',
    }
  } else {
    throw new Error(`fal: 알 수 없는 task '${job.task}'`)
  }
  const r = await fal.subscribe(model, { input, logs: false })
  const url = r?.data?.images?.[0]?.url ?? r?.data?.video?.url
  if (!url) throw new Error('fal: 결과 URL 없음')
  return { url, model, meta: {} }
}
