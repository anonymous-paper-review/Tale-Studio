// 영상 Take 목록은 지금 영상을 실제로 만든 모델을 알려 준다 — 샷 모델을 바꿔도 옛 Take 의 모델 이름이 따라 바뀌지 않게 (fb-camera 발견 · 리드 2026-11-22)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ embedFails: false, rows: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'video_clips') throw new Error(`unexpected table ${table}`)
      let select = ''
      const chain = {
        select(columns: string) {
          select = columns
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
vi.mock('@/lib/director/job-cancellations', () => ({ cancelledJobsById: async () => new Map() }))

import { listLiveDirectorVideoTakes } from '@/lib/director-video-takes'
import { VIDEO_MODELS } from '@/lib/video-models'

const VIDEO = 'https://media.test/ws/p/videos/clip-a/job-a.mp4'

function take(job: Record<string, unknown> | null, patch: Record<string, unknown> = {}) {
  return {
    id: 'clip-a',
    project_id: 'project-1',
    shot_id: 'shot-a',
    take_number: 1,
    url: VIDEO,
    storage_path: 'ws/p/videos/clip-a/job-a.mp4',
    override: { provider: 'seedance' },
    last_attempt_job_id: (job?.id as string | undefined) ?? null,
    last_attempt_job: job,
    ...patch,
  }
}

function job(model: string, patch: Record<string, unknown> = {}) {
  return { id: 'job-a', status: 'completed', model, result_url: VIDEO, resolution: null, ...patch }
}

async function madeModels(...rows: Array<Record<string, unknown>>) {
  db.rows = rows
  return (await listLiveDirectorVideoTakes('project-1')).map((t) => t.made_model)
}

beforeEach(() => {
  db.embedFails = false
  db.rows = []
})

describe('혼자 정한 것', () => {
  // 왜: 판이 모델 이름을 Take 에 고른 값 · 샷의 지금 모델로 정해, 샷 모델을 바꾸면 옛 Take 의 이름까지 바뀌어 보였다
  //   (fb-camera 2026-11-22 — 이어서 시험 Take 둘은 작업 기록상 Happy Horse 인데 판에는 "Seedance 2.0").
  //   고른 모델이 실패해 다른 모델로 넘어가면 작업 기록의 모델 칸도 넘어간 모델로 바뀐다 — 그래서 그 칸이 지금 영상을 만든 모델이다.
  it('Take 목록은 지금 영상을 낸 작업의 모델을 싣는다 — Take 에 고른 모델과 달라도 작업이 실제로 부른 모델이다', async () => {
    expect(await madeModels(take(job('alibaba/happy-horse/reference-to-video')))).toEqual(['happy-horse'])
    for (const spec of Object.values(VIDEO_MODELS)) {
      expect(await madeModels(take(job(spec.endpoint)))).toEqual([spec.key])
    }
  })

  // 왜: 다시 만드는 중이거나 다시 만들기가 실패하면 지금 보이는 영상은 예전 작업이 낸 것이라, 마지막 시도의 모델은 지금 영상의 모델이 아니다.
  //   판은 그때 지금처럼 보인다(만든 그림 · 방식과 같은 규칙).
  it('다시 만드는 중 · 다시 만들기가 실패한 Take 는 만든 모델을 모른다고 싣는다', async () => {
    expect(await madeModels(
      take(job('alibaba/happy-horse/reference-to-video', { id: 'job-new', status: 'queued', result_url: null })),
      take(job('alibaba/happy-horse/reference-to-video', { id: 'job-failed', status: 'failed', result_url: null }), {
        id: 'clip-b', url: 'https://media.test/ws/p/videos/clip-b/job-old.mp4', storage_path: 'ws/p/videos/clip-b/job-old.mp4',
      }),
      take(null, { id: 'clip-c', url: null, storage_path: null }),
    )).toEqual([null, null, null])
  })

  // 왜: 대체 모델 MiniMax 는 고를 수 있는 모델 목록에 없어 판이 이름을 붙일 수 없다 — 판은 그때 지금처럼 보인다.
  //   "MiniMax(대체)"처럼 따로 보일지는 이 조각에서 정하지 않는다.
  it('고를 수 없는 대체 모델(MiniMax)로 만든 영상은 만든 모델을 모른다고 싣는다', async () => {
    expect(await madeModels(take(job('minimax/h3-max/image-to-video')))).toEqual([null])
  })

  // 왜: 작업 기록을 함께 읽는 일이 막혀도 영상 Take 는 그대로 떠야 한다 — 해상도 · 그림 · 방식 표시처럼 만든 모델만 빠진다.
  it('작업 기록을 함께 읽지 못해도 Take 목록은 그대로 보이고 만든 모델만 빠진다', async () => {
    db.embedFails = true
    db.rows = [take(job('alibaba/happy-horse/reference-to-video'))]

    const takes = await listLiveDirectorVideoTakes('project-1')

    expect(takes.map((t) => [t.id, t.url, t.made_model])).toEqual([['clip-a', VIDEO, null]])
  })
})
