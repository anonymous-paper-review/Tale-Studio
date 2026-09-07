// 장면 배치 정보를 넣으면 한눈에 보는 배치도 그림을 만든다 (실제 AI 호출 0회·fal 과금 없음·운영 DB·저장소에는 쓰지 않고 지정한 로컬 파일에 쓴다)
/* eslint-disable @typescript-eslint/no-explicit-any -- 수동 하네스: 드라이런 JSON 을 그대로 다룬다 */
// 드라이런 JSON(shots[].screen_layout) → 배치도 시트 PNG 미리보기. RUN_BLOCKOUT_PREVIEW=1 STAGE_IN=<json> STAGE_OUT=<png>
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildBlockoutSheetSvg, columnFromLayout, renderBlockoutPng } from '@/lib/writer/pipeline/stage/blockout'

describe.skipIf(process.env.RUN_BLOCKOUT_PREVIEW !== '1')('장면 배치도 미리보기', () => {
  it('장면 배치 자료를 넣으면 한눈에 보는 배치도 그림을 만든다', async () => {
    const d = JSON.parse(readFileSync(process.env.STAGE_IN!, 'utf8'))
    const shots = d.shots.filter((s: any) => s.screen_layout).slice(0, Number(process.env.STAGE_COLS ?? 4))
    const columns = shots.map((s: any) => columnFromLayout(s.screen_layout, s.character_blocking.map((b: any) => b.character_id)))
    const { svg } = buildBlockoutSheetSvg(columns, { aspect: 16 / 9 })
    const png = await renderBlockoutPng(svg)
    writeFileSync(process.env.STAGE_OUT!, png)
    expect(png.length).toBeGreaterThan(1000)
  })
})
