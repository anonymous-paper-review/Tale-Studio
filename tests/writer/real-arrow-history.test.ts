// Storyboard 지난 판 줄에서 화살표를 고친 판(arrows-…)의 작은 그림이 가운데 장인지 — 시작 장이 밑 판과 같아 구별이 안 되므로(검토 rev-realarrow 1) — 를 검사한다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pastImageVersions } from '@/lib/version-history'
import { withArrowVersion } from '@/lib/storyboard/real-arrow-edit'
import { selectStoryboardVersion, withStoryboardVersion } from '@/lib/director/storyboard-image-versions'

// 이 시험을 위해 지은 실사 시트 — v1(처음 그림) · v2(화살표를 고친 판, 시작 장은 v1 과 같다) · v3(다시 그림, 지금 그림).
const B = 'https://media.test/ws/p1/shots'
const V1 = { start: `${B}/g1_start.png`, direction: `${B}/g1_direction.png`, end: `${B}/g1_end.png` }
const EDITED = `${B}/a9_direction.png`
const V3 = { start: `${B}/g3_start.png`, direction: `${B}/g3_direction.png`, end: `${B}/g3_end.png` }
const one = withStoryboardVersion(null, { id: 'g1', url: V1.start, frames: V1, generatedAt: 10, source: 'generated' }, { select: true })
const two = withArrowVersion(one, { id: 'arrows-1', direction: EDITED, at: 20, from: V1.direction })!
const three = withStoryboardVersion(two, { id: 'g3', url: V3.start, frames: V3, generatedAt: 30, source: 'generated' }, { select: true })

describe('Storyboard 지난 판 줄의 화살표 판', () => {
  // 왜(검토 rev-realarrow 1): 화살표 판은 시작 장이 밑 판과 같다 — 시작 장을 작은 그림으로 쓰면 v1 · v2 가 같은 그림으로 보여 어느 판이 고친 것인지 모른다.
  it('Storyboard 지난 판 줄에서 화살표를 고친 판은 가운데 장을 작은 그림으로 보인다', () => {
    const past = pastImageVersions(three, { arrowMiddleThumb: true })
    expect(past.map((v) => [v.id, v.thumbUrl])).toEqual([['arrows-1', EDITED], ['g1', V1.start]])
    expect(readFileSync('src/features/storyboard/real-board-view.tsx', 'utf8')).toMatch(/pastImageVersions\(images\[shot\.shotId\] as StoryboardImage \| null, \{ arrowMiddleThumb: true \}\)/)
  })

  // 왜: 정상 경로 고정 — 다른 판과 Director 지난 판 줄(그 판정은 n-video 몫)은 지금처럼 시작 그림을 보인다.
  it('다른 판과 Director 지난 판 줄은 지금처럼 시작 그림을 보인다', () => {
    expect(pastImageVersions(three).map((v) => v.thumbUrl)).toEqual([V1.start, V1.start])
    const back = selectStoryboardVersion(three, 'arrows-1')!
    expect(pastImageVersions(back, { arrowMiddleThumb: true }).map((v) => [v.id, v.thumbUrl])).toEqual([['g3', V3.start], ['g1', V1.start]])
    for (const file of ['src/features/director/canvas-views/StoryboardGridView.tsx', 'src/features/director/canvas-nodes/ShotNode.tsx']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/arrowMiddleThumb/)
    }
  })
})
