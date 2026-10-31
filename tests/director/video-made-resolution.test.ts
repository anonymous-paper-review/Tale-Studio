// 영상 테이크 목록은 지금 영상이 실제로 1080p 로 만들어졌는지를 그 영상을 낸 작업 기록으로 알려준다 (2026-10-31 리뷰)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  selects: [] as string[],
  embedFails: false,
  rows: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'video_clips') throw new Error(`unexpected table ${table}`)
      let select = ''
      const chain = {
        select(columns: string) {
          select = columns
          db.selects.push(columns)
          return chain
        },
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        then(resolve: (value: unknown) => unknown) {
          const embedded = select.includes('generation_jobs')
          if (embedded && db.embedFails) {
            return Promise.resolve({ data: null, error: { message: 'Could not find a relationship', code: 'PGRST200' } }).then(resolve)
          }
          const data = db.rows.map((row) => {
            if (embedded) return row
            const { last_attempt_job: _job, ...plain } = row
            void _job
            return plain
          })
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return chain
    },
  },
}))

import { listLiveDirectorVideoTakes } from '@/lib/director-video-takes'

const URL_A = 'https://media.test/ws/p/videos/clip-a/job-a.mp4'
function take(id: string, url: string | null, job: Record<string, unknown> | null) {
  return {
    id,
    project_id: 'project-1',
    shot_id: `shot-${id}`,
    take_number: 1,
    url,
    storage_path: url ? url.replace('https://media.test/', '') : null,
    last_attempt_job_id: (job?.id as string | undefined) ?? null,
    last_attempt_job: job,
  }
}
function job(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    status: 'completed',
    model: 'alibaba/happy-horse/reference-to-video',
    result_url: `https://media.test/ws/p/videos/clip-${id.slice(-1)}/${id}.mp4`,
    resolution: '1080p',
    ...patch,
  }
}

beforeEach(() => {
  db.selects = []
  db.embedFails = false
  db.rows = []
})

describe('혼자 정한 것', () => {
  // 왜: 노드의 1080p 표시는 지금 보이는 영상이 정말 1080p 일 때만 붙어야 한다 — 그 근거는 그 영상 파일을 낸 작업 기록뿐이다.
  it('지금 영상을 낸 작업이 1080p로 만들었으면 그 테이크에 1080p를 알리고, 720p 작업이면 알리지 않는다', async () => {
    db.rows = [
      take('a', URL_A, job('job-a')),
      take('b', 'https://media.test/ws/p/videos/clip-b/job-b.mp4', job('job-b', { resolution: null, model: 'bytedance/seedance-2.0/reference-to-video' })),
    ]

    const takes = await listLiveDirectorVideoTakes('project-1')

    expect(takes.map((t) => [t.id, t.video_resolution])).toEqual([['a', '1080p'], ['b', null]])
    expect(takes[0]).not.toHaveProperty('last_attempt_job')
    expect(db.selects).toHaveLength(1)
  })

  // 왜: 고른 모델이 실패해 미니맥스로 넘어가면 1080p 를 골랐어도 768P 영상이 나온다.
  it('대체 모델 미니맥스로 만든 영상은 1080p를 골랐어도 1080p로 알리지 않는다', async () => {
    db.rows = [take('a', URL_A, job('job-a', { model: 'minimax/h3-max/image-to-video' }))]

    const [only] = await listLiveDirectorVideoTakes('project-1')

    expect(only!.video_resolution).toBeNull()
  })

  // 왜: 다시 만드는 중이거나 다시 만들기가 실패하면 지금 보이는 영상은 예전 작업이 낸 것이다 — 그 해상도는 모르니 표시하지 않는다.
  it('마지막 시도가 지금 영상을 낸 작업이 아니면 해상도를 모른다고 보고 알리지 않는다', async () => {
    db.rows = [
      take('a', URL_A, job('job-new', { status: 'queued', result_url: null })),
      take('b', 'https://media.test/ws/p/videos/clip-b/job-old.mp4', job('job-failed', { status: 'failed', result_url: null })),
      take('c', null, null),
    ]

    const takes = await listLiveDirectorVideoTakes('project-1')

    expect(takes.map((t) => t.video_resolution)).toEqual([null, null, null])
  })

  // 왜: 작업 기록을 함께 읽는 일이 막혀도 Director 캔버스의 영상 테이크는 그대로 떠야 한다 — 해상도 표시만 빠진다.
  it('작업 기록을 함께 읽지 못해도 영상 테이크 목록은 그대로 보여준다', async () => {
    db.embedFails = true
    db.rows = [take('a', URL_A, job('job-a'))]

    const takes = await listLiveDirectorVideoTakes('project-1')

    expect(takes.map((t) => [t.id, t.url, t.video_resolution])).toEqual([['a', URL_A, null]])
    expect(db.selects).toEqual([expect.stringContaining('generation_jobs'), '*'])
  })
})
