// 대본 장면 머리의 시간이 붙임표 두 개(--)로 붙어 있어도 장소와 시간을 나눈다 (검토 c 낮음 5, 리드 2026-11-10 B1)
import { describe, expect, it } from 'vitest'
import { parseScript } from '@/lib/writer/script/parse'

// 이 시험을 위해 지은 짧은 대본(실제 작품 아님).
const SCRIPT = `EXT. COUNTRY ROAD -- NIGHT
An old bus slows down.

DRIVER: Hop in.

S#2. 해변 -- 낮
파도가 친다.

MAYA: 바다다.`

describe('혼자 정한 것', () => {
  // 왜: 검토 c 낮음 5. "EXT. COUNTRY ROAD -- NIGHT" 는 시간이 안 떨어져 "COUNTRY ROAD -- NIGHT" 라는 배경이 따로 생겼다.
  //   붙임표 하나 · en dash · em dash 는 지금도 나눈다.
  it('장면 머리의 시간이 붙임표 두 개(--)로 붙어 있어도 장소와 시간을 나눈다', () => {
    const doc = parseScript(SCRIPT, { assumeScript: true })!

    expect(doc.scenes.map((scene) => [scene.location, scene.time_of_day])).toEqual([
      ['COUNTRY ROAD', 'NIGHT'],
      ['해변', '낮'],
    ])
  })
})
