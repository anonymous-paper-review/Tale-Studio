// 영상 Take 목록은 그 Take 를 만든 작업이 실제로 쓴 시작 · 끝 그림 주소를 알려준다 — 화면이 "시작 v1 + 끝 v1"을 낸다 (디자이너 11/13 D7 · 리드 B)
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

const VIDEO = 'https://media.test/ws/p/videos/clip-a/job-a.mp4'

beforeEach(() => {
  db.rows = []
})

describe('Take 가 쓴 그림', () => {
  it('지금 영상을 낸 작업이 쓴 시작 · 끝 그림 주소를 그 Take 에 알려준다', async () => {
    // 왜: D7 Take 카드 "시작 v1 + 끝 v1" — 그 Take 를 만들 때 서버가 고른 그림이 작업 기록에 남아 있다(리드 B, 따로 쓰지 않고 읽어서).
    db.rows = [{
      id: 'a', project_id: 'project-1', shot_id: 'shot-1', take_number: 1, url: VIDEO, storage_path: 'ws/p/videos/clip-a/job-a.mp4',
      last_attempt_job: {
        id: 'job-a', status: 'completed', model: 'bytedance/seedance-2.0/reference-to-video', result_url: VIDEO, resolution: null,
        reference_image_url: 'https://media.test/s1_gjob-1_storyboard_start.png?v=1',
        reference_image_urls: ['https://media.test/s1_gjob-1_storyboard_start.png?v=1', 'https://media.test/s1_gjob-1_storyboard_end.png?v=1'],
        reference_image_roles: ['start', 'end'],
      },
    }]
    const [take] = await listLiveDirectorVideoTakes('project-1')
    expect(take!.made_frames).toEqual({
      start: 'https://media.test/s1_gjob-1_storyboard_start.png?v=1',
      end: 'https://media.test/s1_gjob-1_storyboard_end.png?v=1',
    })
  })

  it('지금 영상을 낸 작업이 아니거나 아직 만드는 중이면 쓴 그림을 모른다고 본다', async () => {
    // 왜: 다시 만드는 중 · 실패한 시도의 그림은 지금 보이는 영상의 그림이 아니다(1080p 표시와 같은 규칙).
    db.rows = [{
      id: 'a', project_id: 'project-1', shot_id: 'shot-1', take_number: 1, url: VIDEO, storage_path: 'ws/p/videos/clip-a/job-a.mp4',
      last_attempt_job: { id: 'job-b', status: 'queued', model: 'm', result_url: null, resolution: null, reference_image_url: 'https://media.test/x.png', reference_image_urls: null, reference_image_roles: null },
    }]
    const [take] = await listLiveDirectorVideoTakes('project-1')
    expect(take!.made_frames).toBeNull()
  })
})
