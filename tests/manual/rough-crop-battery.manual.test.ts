import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { cropRoughGridFrames } from '@/lib/writer/rough-grid-crop'
import type { ProjectFormat } from '@/types/project'

// #detect-normalize 실측 배터리 (수동 게이트 — 코퍼스는 gitignored 로컬 자산):
//   BATTERY=1 pnpm vitest run tests/rough-crop-battery.manual.test.ts
// 코퍼스: research/experiments/sheet-formats/corpus/<fmt>-<name>-nN.png
//   (fmt: vt=vertical_9:16, sq=square_1:1, hz=horizontal_16:9, cn=cinema — 오늘 실측 시트 원본들)
// 지표 3종 — "파싱이 조금씩 안 맞아 빈공간" 사고의 회귀 정의:
//   ① 크기 균일: 전 프레임 동일 치수 ② white-band: start/end 상·하단 18행 연속 전폭 밝음 금지
//   ③ direction 잉크: 하단 절반에 내용 존재(라벨 소실 검출)

const LIVE = process.env.BATTERY === '1'
const CORPUS_DIR = path.join(process.cwd(), 'research/experiments/sheet-formats/corpus')
const BATTERY_READY = LIVE && existsSync(CORPUS_DIR)
const FMT: Record<string, ProjectFormat> = {
  vt: 'vertical_9:16',
  sq: 'square_1:1',
  hz: 'horizontal_16:9',
  cn: 'cinema_2.39:1',
}

async function whiteBand(buf: Buffer, edge: 'top' | 'bottom'): Promise<number> {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true })
  let run = 0
  let best = 0
  for (let i = 0; i < Math.min(26, info.height); i++) {
    const y = edge === 'top' ? i : info.height - 1 - i
    let bright = 0
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] >= 235) bright++
    if (bright / info.width >= 0.97) best = Math.max(best, ++run)
    else run = 0
  }
  return best
}

describe.runIf(BATTERY_READY)('rough crop battery — 실측 시트 코퍼스', () => {
  const dir = CORPUS_DIR
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : []
  it(`코퍼스 ${files.length}장: 균일·빈밴드·라벨 지표`, async () => {
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const m = /^([a-z]+)-.*-n(\d+)\.png$/.exec(f)
      if (!m) continue
      const fmt = FMT[m[1]]
      const n = Number(m[2])
      const frames = await cropRoughGridFrames(readFileSync(path.join(dir, f)), 'grid4', n, fmt)
      const dims = new Set<string>()
      for (let s = 0; s < frames.length; s++) {
        for (const key of ['start', 'direction', 'end'] as const) {
          const meta = await sharp(frames[s][key]).metadata()
          dims.add(`${meta.width}x${meta.height}`)
          if (key !== 'direction') {
            expect(await whiteBand(frames[s][key], 'top'), `${f} s${s + 1} ${key} top band`).toBeLessThan(18)
            expect(await whiteBand(frames[s][key], 'bottom'), `${f} s${s + 1} ${key} bottom band`).toBeLessThan(18)
          }
        }
      }
      expect(dims.size, `${f} 크기 균일 (${[...dims].join(',')})`).toBe(1)
    }
  }, 300000)
})
