/* eslint-disable @typescript-eslint/no-explicit-any -- 수동 하네스: 드라이런 JSON 을 그대로 다룬다 */
// 드라이런 JSON(shots[].screen_layout) → 배치도 시트 PNG 미리보기. RUN_BLOCKOUT_PREVIEW=1 STAGE_IN=<json> STAGE_OUT=<png>
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildBlockoutSheetSvg, columnFromLayout, renderBlockoutPng } from '@/lib/writer/pipeline/stage/blockout'

describe.skipIf(process.env.RUN_BLOCKOUT_PREVIEW !== '1')('blockout preview', () => {
  it('renders a sheet from a dry-run json', async () => {
    const d = JSON.parse(readFileSync(process.env.STAGE_IN!, 'utf8'))
    const shots = d.shots.filter((s: any) => s.screen_layout).slice(0, Number(process.env.STAGE_COLS ?? 4))
    const columns = shots.map((s: any) => columnFromLayout(s.screen_layout, s.character_blocking.map((b: any) => b.character_id)))
    const { svg } = buildBlockoutSheetSvg(columns, { aspect: 16 / 9 })
    const png = await renderBlockoutPng(svg)
    writeFileSync(process.env.STAGE_OUT!, png)
    expect(png.length).toBeGreaterThan(1000)
  })
})
