// 시작 프레임 재시도 전용 — fal T2I가 content_policy_violation으로 실패한 4샷을 동일 프롬프트(무변경)로
// 재시도한다(fal 쪽도 확률적 차단 — FRAME_FAILURES.md 참조). runShotImages는 이미 success인 샷을
// 캐시(15_v6_shotImages.json)로 skip하므로 실패분만 재요청된다. 프롬프트는 여전히 손대지 않음.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import { runShotImages } from '@/lib/writer/pipeline/stages/v6_images'
import { PipelineLogger } from '@/lib/writer/logger'
import type { RenderPromptsOutput } from '@/lib/writer/types/pipeline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXP_DIR = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(__dirname, '../../../../../')

dotenv.config({ path: path.join(REPO_ROOT, '.env.local') })

const PROJECT_ID = process.env.RETRY_PROJECT_ID ?? ''
const ENABLED = process.env.RUN_RETRY_BASE_FRAMES === '1' && !!process.env.FAL_KEY && !!PROJECT_ID

describe.skipIf(!ENABLED)('BASE arm — 실패 프레임 재시도', () => {
  it(
    '동일 프롬프트로 실패한 T2I 샷만 재시도',
    async () => {
      const logsDir = path.join(REPO_ROOT, 'logs', PROJECT_ID)
      const renderPrompts = JSON.parse(
        fs.readFileSync(path.join(logsDir, '14_v5_renderPrompts.json'), 'utf8'),
      ) as RenderPromptsOutput

      const logger = new PipelineLogger(PROJECT_ID)
      await logger.init()
      const imagesOut = await runShotImages(renderPrompts, logger, {
        concurrency: 2,
        pollWindowMs: 5 * 60 * 1000,
        pollIntervalMs: 10_000,
      })

      const assetsBaseDir = path.join(EXP_DIR, 'assets', 'arm-base')
      const framesDir = path.join(assetsBaseDir, 'frames')
      fs.mkdirSync(framesDir, { recursive: true })

      const shotsJsonPath = path.join(assetsBaseDir, 'shots.json')
      const shotsJson = JSON.parse(fs.readFileSync(shotsJsonPath, 'utf8')) as {
        shots: Array<{ n: string; shot_id: string; video_prompt: string; duration_seconds: number }>
      }
      const jobsPath = path.join(EXP_DIR, 'jobs.base.json')
      const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8')) as Array<Record<string, unknown>>
      const existingIds = new Set(jobs.map((j) => j.id))

      const stillFailing: string[] = []
      for (const shot of shotsJson.shots) {
        if (existingIds.has(`base_${shot.n}`)) continue // 이미 프레임 확보됨
        const img = imagesOut.shots.find((r) => r.shot_id === shot.shot_id)
        if (!img || img.status !== 'success' || !img.image_url) {
          stillFailing.push(`${shot.n} (${shot.shot_id}): ${img?.error ?? img?.status ?? 'no result'}`)
          continue
        }
        const res = await fetch(img.image_url)
        if (!res.ok) {
          stillFailing.push(`${shot.n} (${shot.shot_id}): download HTTP ${res.status}`)
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const ct = res.headers.get('content-type') ?? ''
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg'
        const frameRel = `arm-base/frames/${shot.n}.${ext}`
        fs.writeFileSync(path.join(EXP_DIR, 'assets', frameRel), buf)
        jobs.push({
          id: `base_${shot.n}`,
          task: 'i2v_se',
          prompt: shot.video_prompt,
          image: frameRel,
          seconds: shot.duration_seconds,
          aspect: '16:9',
          out: `clips/arm-base/${shot.n}.mp4`,
        })
      }

      jobs.sort((a, b) => String(a.id).localeCompare(String(b.id)))
      fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2))

      if (stillFailing.length > 0) {
        fs.writeFileSync(
          path.join(assetsBaseDir, 'FRAME_FAILURES.md'),
          `# 시작 프레임 생성 실패 목록 (재시도 후에도 ${stillFailing.length}건 잔존)\n\n` +
            stillFailing.map((f) => `- ${f}`).join('\n') +
            '\n',
        )
      } else if (fs.existsSync(path.join(assetsBaseDir, 'FRAME_FAILURES.md'))) {
        fs.rmSync(path.join(assetsBaseDir, 'FRAME_FAILURES.md'))
      }

      console.log(`[retry] jobs.base.json now has ${jobs.length} entries; still failing: ${stillFailing.length}`)
      expect(jobs.length).toBeGreaterThan(0)
    },
    10 * 60 * 1000,
  )
})
