// 만드는 중인 카드 · 노드마다 [멈추기]가 있고, 누르면 그 샷이 만들던 이미지나 영상을 화면에서 멈춘다 — 이미지는 4샷 한 장 단위 (시안 D4 406:5275 · 오너 2026-11-14 7번, 리드 S4-2 6)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveJob } from '@/lib/generation-queue'

const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({ getQueryClient: () => shared.client }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'is', 'in', 'not', 'maybeSingle', 'update']) chain[m] = () => chain
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
      return chain
    },
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { toast } from 'sonner'
import { ShotStateTail } from '@/features/director/shot-status'
import { shotStopTarget, stopNotice, stopShotWork } from '@/lib/director/stop-work'
import { _setGenerationQueueSnapshotForTests } from '@/lib/generation-queue'
import { runRealBatch } from '@/lib/director/real-batch-client'
import { translate } from '@/lib/i18n/translate'
import { useDirectorCanvasStore } from '@/stores/director-store'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const job = (id: string, kind: string, extra: Partial<ActiveJob> = {}): ActiveJob => ({ id, kind: kind as ActiveJob['kind'], target: {}, ...extra })
const grid = () => readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')
const stopButton = createElement('button', { type: 'button' }, '멈추기')

describe('같이 정한 것', () => {
  it('만드는 중인 실사 보기 카드에는 꼬리 옆에 [멈추기]가 있고, 누르면 그 샷이 만들던 이미지나 영상을 화면에서 멈춘다', async () => {
    // 왜: 오너 7번 "UI로는 취소된걸로 보이게 해서 유저가 수정해서 다시 생성 요청" · 시안 D4 [멈추기] — 예전엔 한 샷만 멈출 길이 없었다.
    const jobs = [
      job('video-1', 'shot_video', { target: { writerShotId: 'w1' } }),
      job('image-1', 'shot_storyboard', { target: { writerShotId: 'w5' } }),
    ]
    expect(shotStopTarget(jobs, 'w1', 'video')).toEqual({ jobIds: ['video-1'], sheetShots: 1 })
    expect(shotStopTarget(jobs, 'w5', 'image')).toEqual({ jobIds: ['image-1'], sheetShots: 1 })
    expect(shotStopTarget(jobs, 'w1', 'image')).toBeNull()

    const cancel = vi.fn(async (ids: string[]) => ids)
    expect(await stopShotWork(cancel, { jobIds: ['video-1'], sheetShots: 1 }, 'video')).toEqual({ ok: true, text: stopNotice({ images: 0, videos: 1 }) })
    expect(cancel).toHaveBeenCalledWith(['video-1'])
    expect(await stopShotWork(cancel, { jobIds: ['image-1'], sheetShots: 1 }, 'image')).toEqual({ ok: true, text: stopNotice({ images: 1, videos: 0 }) })

    expect(renderToStaticMarkup(createElement(ShotStateTail, { state: 'video_generating', stop: stopButton }))).toContain('멈추기')
    expect(renderToStaticMarkup(createElement(ShotStateTail, { state: 'image_generating', stop: stopButton }))).toContain('멈추기')
    expect(grid()).toMatch(/stop=\{\s*stopTarget \?/)
    expect(grid()).toContain('activeJobs={activeJobs}')
  })
})

describe('혼자 정한 것', () => {
  it('이미지 [멈추기]는 4샷 한 장 단위다 — 같은 장에 묶인 샷이 함께 멈춘다는 것을 누르기 전에 알리고, 멈춘 뒤에도 몇 개가 같이 멈췄는지 알린다', async () => {
    // 왜: 4샷이 한 장(작업 하나)이라 샷 하나만 멈출 수 없다(S4 혼자 정한 것 c). 다른 카드까지 멈추는 것을 모르고 누르지 않게.
    const sheet = [job('sheet-1', 'storyboard_real_grid', { target: { writerShotIds: ['w1', 'w2', 'w3', 'w4'] } })]
    expect(shotStopTarget(sheet, 'w2', 'image')).toEqual({ jobIds: ['sheet-1'], sheetShots: 4 })
    expect(ko('{count} shots on the same sheet stop together', { count: 4 })).toBe('같은 장 샷 4개가 같이 멈춰요')
    const cancel = vi.fn(async (ids: string[]) => ids)
    const result = await stopShotWork(cancel, { jobIds: ['sheet-1'], sheetShots: 4 }, 'image')
    expect(result.ok).toBe(true)
    expect(ko(result.text, result.params)).toBe('같은 장 샷 4개를 같이 멈췄어요. 그리던 이미지는 뒤늦게 끝나면 버전으로 남아요.')
    expect(readFileSync('src/features/director/stop-making-button.tsx', 'utf8')).toContain("t('{count} shots on the same sheet stop together'")
  })

  it('아직 보내지 않고 차례를 기다리는 샷과 이미 멈춘 작업에는 [멈추기]가 없다', () => {
    // 왜: 보낸 작업이 없으면 멈출 것이 없다 — 남은 차례는 [모두 멈추기]가 멈춘다. 이미 멈춘 작업을 또 멈추지 않는다.
    expect(shotStopTarget([], 'w1', 'image')).toBeNull()
    expect(shotStopTarget([job('v', 'shot_video', { target: { writerShotId: 'w1' }, cancelledAt: '2026-11-14T00:00:00.000Z' })], 'w1', 'video')).toBeNull()
    expect(renderToStaticMarkup(createElement(ShotStateTail, { state: 'image_generating', waiting: true, stop: stopButton }))).not.toContain('멈추기')
    expect(renderToStaticMarkup(createElement(ShotStateTail, { state: 'image_done', stop: stopButton }))).not.toContain('멈추기')
  })

  it('멈추지 못하면 "멈추지 못했어요. 다시 눌러 주세요."를, 누르기 전에 이미 끝났으면 "이미 다 만든 뒤였어요."를 알린다', async () => {
    // 왜: 요청이 끊기면 그대로 만드는 중이다(prose 상세와 같은 말). 막 끝난 것을 "멈췄어요"라고 하면 거짓말이다.
    expect(await stopShotWork(vi.fn(async () => { throw new Error('down') }), { jobIds: ['x'], sheetShots: 1 }, 'video')).toEqual({ ok: false, text: 'Could not stop it. Try again.' })
    const done = await stopShotWork(vi.fn(async () => []), { jobIds: ['x'], sheetShots: 1 }, 'video')
    expect(ko(done.text)).toBe('이미 다 만든 뒤였어요.')
  })

  describe('이미지 일괄', () => {
    let posts: number
    beforeEach(() => {
      vi.useFakeTimers()
      shared.client = new QueryClient()
      useDirectorCanvasStore.getState().reset()
      useDirectorCanvasStore.getState().setProjectId('p1')
      _setGenerationQueueSnapshotForTests({ projectId: 'p1', jobs: [] })
      posts = 0
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('/api/director/generate-storyboard-batch')) {
          posts += 1
          return new Response(JSON.stringify({ ok: true, data: { submitted: [{ jobId: `job-${posts}`, shotIds: ['s1', 's2', 's3', 's4'] }], remaining: 4 } }), { status: 200 })
        }
        if (url.startsWith('/api/director/video-takes')) return new Response(JSON.stringify({ takes: [] }), { status: 200 })
        if (url.startsWith('/api/generation-jobs/')) return new Response(JSON.stringify({ data: { status: 'queued' } }), { status: 200 })
        return new Response(JSON.stringify({ ok: true, data: { jobs: [], cancelled: [] } }), { status: 200 })
      }))
    })
    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
      _setGenerationQueueSnapshotForTests({ projectId: '', jobs: [] })
    })

    it('이미지 일괄 중 한 장을 멈추면 끝 알림의 "만들었어요" 수는 끝난 장의 샷만 센다', async () => {
      // 왜: 검토 a cbb84e64 낮음 2 — 멈춘 장의 샷까지 "N컷 만들었어요"로 셌다.
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('/api/director/generate-storyboard-batch')) {
          posts += 1
          const shotIds = posts === 1 ? ['s1', 's2', 's3', 's4'] : ['s5', 's6', 's7', 's8']
          return new Response(JSON.stringify({ ok: true, data: { submitted: [{ jobId: `job-${posts}`, shotIds }], remaining: posts === 1 ? 4 : 0 } }), { status: 200 })
        }
        // 다시 읽기(hydrateFromDb)가 받는 Take 목록 — 비어 있음.
        if (url.startsWith('/api/director/video-takes')) return new Response(JSON.stringify({ takes: [] }), { status: 200 })
        if (url.startsWith('/api/generation-jobs/job-2')) return new Response(JSON.stringify({ data: { status: 'completed' } }), { status: 200 })
        if (url.startsWith('/api/generation-jobs/')) return new Response(JSON.stringify({ data: { status: 'queued' } }), { status: 200 })
        return new Response(JSON.stringify({ ok: true, data: { jobs: [], cancelled: [] } }), { status: 200 })
      }))
      vi.mocked(toast.success).mockClear()
      let done = false
      const run = runRealBatch('p1').finally(() => { done = true })
      await vi.advanceTimersByTimeAsync(10)
      _setGenerationQueueSnapshotForTests({ projectId: 'p1', jobs: [job('job-1', 'storyboard_real_grid', { target: { writerShotIds: ['s1', 's2', 's3', 's4'] }, cancelledAt: '2026-11-14T00:00:00.000Z' })] })
      for (let i = 0; i < 60 && !done; i++) await vi.advanceTimersByTimeAsync(1000)
      await run
      expect(posts).toBe(2)
      expect(vi.mocked(toast.success)).toHaveBeenCalledTimes(1)
      expect(String(vi.mocked(toast.success).mock.calls[0]![0])).toMatch(/\b4\b/)
      expect(String(vi.mocked(toast.success).mock.calls[0]![0])).not.toMatch(/\b8\b/)
    })

    it('이미지 일괄이 돌 때 한 장을 멈추면 일괄은 그 장이 끝나기를 기다리지 않고 다음 장으로 간다', async () => {
      // 왜: 멈춘 장은 fal 에서 끝까지 돈다(몇 분) — 그동안 일괄이 그 장만 기다리면 남은 샷이 멈춘 것처럼 보인다.
      const run = runRealBatch('p1')
      await vi.advanceTimersByTimeAsync(10)
      expect(posts).toBe(1)
      _setGenerationQueueSnapshotForTests({ projectId: 'p1', jobs: [job('job-1', 'storyboard_real_grid', { target: { writerShotIds: ['s1', 's2', 's3', 's4'] }, cancelledAt: '2026-11-14T00:00:00.000Z' })] })
      await vi.advanceTimersByTimeAsync(6000)
      expect(posts).toBe(2)
      useDirectorCanvasStore.getState().cancelRealBatch()
      await vi.advanceTimersByTimeAsync(20_000)
      await run
    })
  })
})
