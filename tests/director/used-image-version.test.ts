// 실사 화살표만 고친 판(시작 그림이 같은 판)이 있어도 Take 가 쓴 판은 작업 기록의 판 id 로 찾고, 판 id 가 없으면 그 Take 를 만들 때의 판으로 본다 (검토 rev-video C · 오너 N4a · N4b)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'video_clips') throw new Error(`unexpected table ${table}`)
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: db.rows, error: null }).then(resolve),
      }
      return chain
    },
  },
}))

import { listLiveDirectorVideoTakes } from '@/lib/director-video-takes'
import { versionOfFrames, withStoryboardVersion } from '@/lib/director/storyboard-image-versions'

const at = (iso: string) => Date.parse(iso)
const version = (id: string, start: string, direction: string, generatedAt: number) => ({
  id, url: `https://media.test/${start}-s.png`,
  frames: { start: `https://media.test/${start}-s.png`, direction: `https://media.test/${direction}-d.png`, end: `https://media.test/${start}-e.png` },
  generatedAt, source: 'generated' as const,
})
/** v1 = 처음 그린 실사, v2 = 실사 화살표만 고쳐 저장한 판(시작 · 끝 그대로 · 가운데 장만 다름 — N4b 의 arrows-… 판). */
const ARROWS = withStoryboardVersion(
  withStoryboardVersion(null, version('job-1', 'a', 'a', at('2026-11-27T00:00:00Z')), { select: true }),
  version('arrows-1', 'a', 'b', at('2026-11-27T02:00:00Z')),
  { select: true },
)
const START = 'https://media.test/a-s.png?v=1'

beforeEach(() => {
  db.rows = []
})

describe('같이 정한 것 — 검토 rev-video C', () => {
  // 왜: 실사 화살표를 저장하면 시작 · 끝 주소가 같은 새 판이 생긴다 — 주소로만 찾으면 같은 주소의 첫 판(v1)을 골라, 그 뒤 만든 Take 도
  //   Take 줄에 "그림 v1"로 적혔다(지금 판은 v2). 그 Take 를 만들 때 서버가 본 판 id 가 작업 기록에 있으면 그 판이다.
  it('시작 그림이 같은 판이 여럿이면 Take 가 쓴 판은 작업 기록의 판 id 로 찾는다', () => {
    expect(versionOfFrames(ARROWS, { start: START, end: null, versionId: 'arrows-1' })).toEqual({ start: 2, end: null })
    expect(versionOfFrames(ARROWS, { start: START, end: null, versionId: 'job-1', at: at('2026-11-27T03:00:00Z') })).toEqual({ start: 1, end: null })
    // 판 id 의 시작 그림이 Take 가 쓴 그림과 다르면(이어서의 이음 장면 등) 판 id 로 정하지 않는다.
    expect(versionOfFrames(ARROWS, { start: 'https://media.test/videos/clip-1/job-9_chain-frame-2850.jpg', end: null, versionId: 'arrows-1' })).toBeNull()
  })

  // 왜: 판 id 를 적기 전의 Take 는 주소만 안다 — 같은 시작 그림의 판 중 그 Take 를 만들 때 이미 있던 가장 새 판이 그때의 지금 판이다.
  //   만든 때를 모르거나 그때 있던 판이 없으면 가장 새 판으로 본다.
  it('판 id 가 없는 옛 Take 는 시작 그림이 같은 판 중 그 Take 를 만들 때의 지금 판을, 그때를 모르면 가장 새 판을 쓴 판으로 본다', () => {
    expect(versionOfFrames(ARROWS, { start: START, end: null, at: at('2026-11-27T01:00:00Z') })).toEqual({ start: 1, end: null })
    expect(versionOfFrames(ARROWS, { start: START, end: null, at: at('2026-11-27T03:00:00Z') })).toEqual({ start: 2, end: null })
    expect(versionOfFrames(ARROWS, { start: START, end: null })).toEqual({ start: 2, end: null })
    expect(versionOfFrames(ARROWS, { start: START, end: null, at: at('2026-11-26T00:00:00Z') })).toEqual({ start: 2, end: null })
  })

  // 왜: 화면이 판 id 로 찾으려면 Take 목록이 지금 영상을 낸 작업의 판 id 를 쓴 그림과 함께 알려 줘야 한다(작업 기록에서 읽는다 — 따로 적지 않는다).
  it('Take 목록은 지금 영상을 낸 작업이 기록한 판 id 를 쓴 그림과 함께 알려 준다', async () => {
    const video = 'https://media.test/ws/p/videos/clip-a/job-a.mp4'
    db.rows = [{
      id: 'a', project_id: 'project-1', shot_id: 'shot-1', take_number: 1, url: video, storage_path: 'ws/p/videos/clip-a/job-a.mp4',
      last_attempt_job: {
        id: 'job-a', status: 'completed', model: 'bytedance/seedance-2.0/reference-to-video', result_url: video, resolution: null,
        reference_image_url: START, reference_image_urls: [START], reference_image_roles: ['start'], storyboard_version_id: 'arrows-1',
      },
    }]
    const [take] = await listLiveDirectorVideoTakes('project-1')
    expect(take!.made_frames).toEqual({ start: START, end: null, versionId: 'arrows-1' })
  })
})
