import { describe, it, expect } from 'vitest'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  buildRoughGridCell,
  buildRoughGridPrompt,
  sheetGeometry,
} from '@/lib/writer/rough-storyboard-grid'
import { cropRoughGridFrames } from '@/lib/writer/rough-grid-crop'
import { buildRealStripPrompt } from '@/lib/director/storyboard-strip'

// #sheet-formats 라이브 실측 (수동 게이트 — 실제 fal 결제 발생 ~$0.4, CI 는 항상 skip):
//   RUN_SHEET_LIVE=1 SHEET_SHOTS=<shots.json> SHEET_OUT=<outdir> pnpm vitest run tests/sheet-formats-live.manual.test.ts
//
// 검증 사슬(전부 실제 프로덕션 코드 경로 — 복붙 없음):
//   R1 vertical grid4 러프 / R2 vertical strip1(가로 3열) 러프 / R3 square grid4 / R4 cinema grid4
//   → 실제 cropRoughGridFrames(포맷 좌표·프레임 축)로 크롭 파스
//   → R2 크롭 3프레임을 fal 스토리지에 올려 R5 세로 스트립 리페인트(가로 3열 문안)까지.
//   프롬프트 재료는 실프로젝트(webtoon_test) 샷의 DB-fallback 경로(스펙 없는 샷의 실경로).
//   템플릿·중간 산물은 fal 스토리지에만 업로드 — 우리 스토리지·DB 는 불변.

const LIVE = process.env.RUN_SHEET_LIVE === '1'

interface ShotRow {
  shot_id: string
  shot_type: string | null
  action_description: string
  characters: string[] | null
  location: string | null
  time_of_day: string | null
  char_names: Record<string, string> | null
}

describe.runIf(LIVE)('sheet-formats 라이브 실측', () => {
  it(
    '신규 템플릿 러프 4종 + 세로 스트립 리페인트 — 수락·치수·크롭 파스',
    async () => {
      const repo = process.cwd()
      const outDir = process.env.SHEET_OUT ?? path.join(repo, 'research/experiments/sheet-formats/out')
      await mkdir(outDir, { recursive: true })

      const env = await readFile(path.join(repo, '.env.local'), 'utf8')
      const key = /^FAL_KEY=(.+)$/m.exec(env)?.[1]?.trim()
      if (!key) throw new Error('FAL_KEY not in .env.local')
      const { fal } = await import('@fal-ai/client')
      fal.config({ credentials: key })

      const shotsFile = process.env.SHEET_SHOTS
      if (!shotsFile) throw new Error('SHEET_SHOTS required')
      const rows = (JSON.parse(await readFile(shotsFile, 'utf8')) as { rows: ShotRow[] }).rows
      expect(rows.length).toBeGreaterThanOrEqual(3)

      const cells = rows.slice(0, 3).map((r) =>
        buildRoughGridCell(
          {
            shotType: r.shot_type ?? 'MS',
            actionDescription: r.action_description,
            characterNames: (r.characters ?? []).map((id) => r.char_names?.[id] ?? id),
            location: r.location,
            timeOfDay: r.time_of_day,
            spec: null, // DB fallback 경로 — 스펙 없는 샷의 실제 프로덕션 경로
          },
          r.shot_id,
        ),
      )

      const uploadPng = async (buf: Buffer, name: string): Promise<string> =>
        (await fal.storage.upload(new File([new Uint8Array(buf)], name, { type: 'image/png' }))) as string

      const MODEL = 'openai/gpt-image-2/edit'
      const submit = async (prompt: string, refUrls: string[], imageSize: string) => {
        const [w, h] = imageSize.split('x').map(Number)
        const { request_id } = await fal.queue.submit(MODEL, {
          input: { prompt, image_urls: refUrls, image_size: { width: w, height: h } },
        })
        return request_id
      }
      const await_ = async (requestId: string, label: string): Promise<Buffer> => {
        for (let i = 0; i < 72; i++) {
          await new Promise((r) => setTimeout(r, 5000))
          const s = await fal.queue.status(MODEL, { requestId, logs: false }).catch(() => null)
          const st = String(s?.status ?? '').toUpperCase()
          if (st === 'COMPLETED') break
          if (st === 'FAILED') throw new Error(`${label}: queue FAILED`)
        }
        const result = await fal.queue.result(MODEL, { requestId })
        const url = (result.data as { images?: Array<{ url?: string }> })?.images?.[0]?.url
        if (!url) throw new Error(`${label}: no image url`)
        return Buffer.from(await (await fetch(url)).arrayBuffer())
      }

      // 템플릿 4장 → fal 스토리지
      const tpl = async (variant: 'grid4' | 'strip1', format: 'vertical_9:16' | 'square_1:1' | 'cinema_2.39:1') => {
        const g = sheetGeometry(variant, format)
        const buf = await readFile(path.join(repo, 'public', g.templatePath.replace(/^\//, '')))
        return { g, url: await uploadPng(buf, path.basename(g.templatePath)) }
      }
      const [vGrid, vStrip, sGrid, cGrid] = await Promise.all([
        tpl('grid4', 'vertical_9:16'),
        tpl('strip1', 'vertical_9:16'),
        tpl('grid4', 'square_1:1'),
        tpl('grid4', 'cinema_2.39:1'),
      ])

      // R1~R4 동시 제출 (러프 생성 — 실제 라우트와 동일 조립: 프롬프트 빌더 + 명시 캔버스)
      const gridPrompt = buildRoughGridPrompt(cells, 'grid4')
      const stripPrompt = buildRoughGridPrompt([cells[0]], 'strip1', { frameAxis: vStrip.g.frameAxis })
      const reqs = await Promise.all([
        submit(gridPrompt, [vGrid.url], vGrid.g.roughImageSize!),
        submit(stripPrompt, [vStrip.url], vStrip.g.roughImageSize!),
        submit(gridPrompt, [sGrid.url], sGrid.g.roughImageSize!),
        submit(gridPrompt, [cGrid.url], cGrid.g.roughImageSize!),
      ])
      const [r1, r2, r3, r4] = await Promise.all([
        await_(reqs[0], 'R1-vertical-grid'),
        await_(reqs[1], 'R2-vertical-strip'),
        await_(reqs[2], 'R3-square-grid'),
        await_(reqs[3], 'R4-cinema-grid'),
      ])
      const dims = async (b: Buffer) => {
        const m = await sharp(b).metadata()
        return `${m.width}x${m.height}`
      }
      await writeFile(path.join(outDir, 'R1-vertical-grid.png'), r1)
      await writeFile(path.join(outDir, 'R2-vertical-strip.png'), r2)
      await writeFile(path.join(outDir, 'R3-square-grid.png'), r3)
      await writeFile(path.join(outDir, 'R4-cinema-grid.png'), r4)
      expect(await dims(r1)).toBe('1024x1536')
      expect(await dims(r2)).toBe('1536x1024')
      expect(await dims(r3)).toBe('1024x1024')
      expect(await dims(r4)).toBe('1536x640')

      // 실제 크롭 파스 — 포맷 좌표·프레임 축 그대로
      const c1 = await cropRoughGridFrames(r1, 'grid4', 3, 'vertical_9:16')
      const c2 = await cropRoughGridFrames(r2, 'strip1', 1, 'vertical_9:16')
      const c3 = await cropRoughGridFrames(r3, 'grid4', 3, 'square_1:1')
      const c4 = await cropRoughGridFrames(r4, 'grid4', 3, 'cinema_2.39:1')
      expect(c1).toHaveLength(3)
      expect(c2).toHaveLength(1)
      expect(c3).toHaveLength(3)
      expect(c4).toHaveLength(3)
      for (const [name, frames] of [
        ['R1s1', c1[0]],
        ['R2s1', c2[0]],
      ] as const) {
        for (const f of ['start', 'direction', 'end'] as const) {
          await writeFile(path.join(outDir, `${name}-${f}.png`), frames[f])
        }
      }
      // 세로 셀 검증: 크롭 프레임이 실제로 세로(AR < 0.8)인가
      for (const frames of [c1[0], c2[0]]) {
        const m = await sharp(frames.start).metadata()
        expect((m.width ?? 1) / (m.height ?? 1)).toBeLessThan(0.8)
      }

      // R5: 리페인트 체인 — R2 크롭 프레임(세로)을 fal 스토리지에 올려 실제 compose 가
      //   transposed 지오메트리를 "스스로" 고르는지 + 가로 3열 리페인트가 성립하는지.
      const frameUrls = {
        start: await uploadPng(c2[0].start, 'r2-start.png'),
        direction: await uploadPng(c2[0].direction, 'r2-direction.png'),
        end: await uploadPng(c2[0].end, 'r2-end.png'),
      }
      const { composeRoughReferenceStrip } = await import('@/lib/director/storyboard-strip')
      const composed = await composeRoughReferenceStrip(frameUrls, 'vertical_9:16')
      expect(composed.sheetFormat).toBe('vertical_9:16') // 프레임 AR 매칭이 포맷 시트를 골라야 한다
      expect(composed.geometry.frameAxis).toBe('cols')
      await writeFile(path.join(outDir, 'R5-ref-composed.png'), composed.buffer)
      const refUrl = await uploadPng(composed.buffer, 'r5-ref.png')
      const repaintPrompt = buildRealStripPrompt(
        `${rows[0].action_description} Finished color illustration, painterly fantasy style.`,
        { characterRefCount: 0, hasStyleRef: false, frameAxis: composed.geometry.frameAxis },
      )
      const r5req = await submit(repaintPrompt, [refUrl], composed.geometry.repaintCanvas)
      const r5 = await await_(r5req, 'R5-vertical-strip-repaint')
      await writeFile(path.join(outDir, 'R5-vertical-strip-repaint.png'), r5)
      expect(await dims(r5)).toBe('1536x1024')
      const c5 = await cropRoughGridFrames(r5, 'strip1', 1, 'vertical_9:16')
      const m5 = await sharp(c5[0].start).metadata()
      expect((m5.width ?? 1) / (m5.height ?? 1)).toBeLessThan(0.8)
      for (const f of ['start', 'direction', 'end'] as const) {
        await writeFile(path.join(outDir, `R5s1-${f}.png`), c5[0][f])
      }
    },
    1_200_000,
  )
})
