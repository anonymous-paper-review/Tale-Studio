// [모두 멈추기]는 아직 보내지 않은 것은 보내지 않고, 이미 만들고 있는 이미지 · 영상도 화면에서 멈춘다 — 멈춘 뒤에는 바로 다시 만들 수 있다 (오너 2026-11-14 7번 · 시안 D3 · D4, 리드 S4-2)
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

import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { runRealBatch } from '@/lib/director/real-batch-client'
import { stoppableJobs, stopNotice, videoBatchLive } from '@/lib/director/stop-work'
import { freshActiveJobs } from '@/lib/director/stop-all-client'
import { _setGenerationQueueSnapshotForTests } from '@/lib/generation-queue'
import { translate } from '@/lib/i18n/translate'

const ko = (text: string) => translate('ko', text)
const page = () => readFileSync('src/app/studio/director/page.tsx', 'utf8')
function stopAllSource(): string {
  const src = page()
  const start = src.indexOf('const stopAll = async () => {')
  return src.slice(start, src.indexOf('\n  }\n', start))
}
const job = (id: string, kind: string, extra: Partial<ActiveJob> = {}): ActiveJob => ({ id, kind: kind as ActiveJob['kind'], target: {}, ...extra })

let calls: Array<{ url: string; body: Record<string, unknown> | null }>

beforeEach(() => {
  vi.useFakeTimers()
  shared.client = new QueryClient()
  useDirectorCanvasStore.getState().reset()
  useDirectorCanvasStore.getState().setProjectId('p1')
  calls = []
  vi.mocked(toast.success).mockClear()
  let posts = 0
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null })
    if (url.startsWith('/api/director/generate-storyboard-batch')) {
      posts += 1
      // 한 판에 4샷 한 장씩 — 아직 4샷 남음.
      return new Response(JSON.stringify({ ok: true, data: { submitted: [{ jobId: `job-${posts}`, shotIds: ['s1', 's2', 's3', 's4'] }], remaining: 4 } }), { status: 200 })
    }
    if (url.startsWith('/api/generation-jobs/')) {
      return new Response(JSON.stringify({ data: { status: 'queued' } }), { status: 200 })
    }
    if (url === '/api/director/jobs/cancel') {
      const ids = ((init?.body ? JSON.parse(String(init.body)) : {}) as { jobIds?: string[] }).jobIds ?? []
      return new Response(JSON.stringify({ ok: true, data: { cancelled: ids.map((jobId) => ({ jobId, kind: 'storyboard_real_grid', writerShotIds: ['s1', 's2', 's3', 's4'], videoClipId: null, cancelledAt: '2026-11-14T00:00:00.000Z' })) } }), { status: 200 })
    }
    return new Response(JSON.stringify({ data: { jobs: [] } }), { status: 200 })
  }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('같이 정한 것', () => {
  it('[모두 멈추기]를 누르면 아직 보내지 않은 것은 보내지 않고, 이미 만들고 있는 이미지 · 영상도 화면에서 멈춘다', () => {
    // 왜: 오너 7번 "아직 보내지 않은 것만 멈추고 이미 생성이 진행 중인 것들은 UI로는 취소된걸로 보이게" — 예전엔 만들던 것이 끝날 때까지 "만드는 중"이었다.
    const jobs = [
      job('sheet', 'storyboard_real_grid'),
      job('one', 'shot_storyboard'),
      job('video', 'shot_video'),
      job('already', 'shot_video', { cancelledAt: '2026-11-14T00:00:00.000Z' }),
      job('rough', 'shot_rough_storyboard'),
    ]
    expect(stoppableJobs(jobs).map((j) => j.id)).toEqual(['sheet', 'one', 'video'])
    const stopAll = stopAllSource()
    expect(stopAll).toContain('run.cancelRealBatch()')
    expect(stopAll).toContain('await run.cancelVideoBatch()')
    // 누를 때 목록을 한 번 새로 읽는다(아래 "새로 읽어" 시험) — 2026-11-14 리드 검토 a 낮음(예전 기대 'stoppableJobs(activeJobsSnapshot(run.projectId))').
    expect(stopAll).toContain('stoppableJobs(await freshActiveJobs(run.projectId))')
    expect(stopAll).toMatch(/await run\.cancelRunningJobs\(/)
  })

  it('멈춘 영상 묶음에 화면에서 멈춘 작업만 남았으면 만드는 중으로 세지 않아 [영상 만들기]를 바로 다시 누를 수 있다', () => {
    // 왜: 오너 7번 "유저가 수정해서 다시 생성 요청할 수 있게" — 멈춘 영상이 fal 에서 끝날 때까지(몇 분) 묶음이 "도는 중"이라 영상 단추가 잠겼다.
    expect(videoBatchLive({ busy: true, cancelled: false, jobIds: ['a'] }, [])).toBe(true)
    expect(videoBatchLive({ busy: true, cancelled: true, jobIds: ['a'] }, [job('a', 'shot_video', { cancelledAt: '2026-11-14T00:00:00.000Z' })])).toBe(false)
    expect(videoBatchLive({ busy: true, cancelled: true, jobIds: ['a'] }, [job('a', 'shot_video')])).toBe(true)
    expect(videoBatchLive({ busy: false, cancelled: false, jobIds: [] }, [])).toBe(false)
    expect(page()).toContain('videoWorkBlock(workStates, picked, videoLive, ')
  })
})

describe('혼자 정한 것', () => {
  it('[모두 멈추기]는 일괄이 아니어도 이 화면에서 무엇이든 만들고 있으면 보인다', () => {
    // 왜: 만드는 중인 것도 멈추게 되어(오너 7번) 카드 · 상세 · 채팅에서 따로 시작한 것도 여기서 멈출 수 있다 — 예전엔 일괄이 돌 때만 보였다.
    const src = page()
    expect(src).not.toContain('(realBatchBusy || videoBatchBusy) && (')
    expect(src).toContain('const making = makingImages + makingVideos > 0 || imageBatchLive || videoLive')
    expect(src).toContain('const imageBatchLive = realBatchBusy && !realBatchCancelled')
  })

  it('멈춘 뒤 알림은 만들던 영상이 있었으면 Take 를 돌려드리지 않고 뒤늦게 끝나면 기록에 남는다고 말한다', () => {
    // 왜: 오너 7번 "테이크는 차감되고 백그라운드에서 끝나면 히스토리로" — 멈춰도 Take 가 빠진다는 것을 알린다. 이미지는 Take 를 쓰지 않는다.
    expect(ko(stopNotice({ images: 1, videos: 1 }))).toBe('멈췄어요. 만들던 영상의 Take 는 돌려드리지 않아요. 뒤늦게 끝나면 기록에 남아요.')
    expect(ko(stopNotice({ images: 2, videos: 0 }))).toBe('멈췄어요. 그리던 이미지는 뒤늦게 끝나면 버전으로 남아요.')
    expect(ko(stopNotice({ images: 0, videos: 0 }))).toBe('멈췄어요.')
    expect(stopAllSource()).toContain('toast.info(t(stopNotice(')
  })

  it('멈추지 못하면 "멈추지 못했어요. 다시 눌러 주세요."를 알리고 [모두 멈추기]를 다시 누를 수 있다', () => {
    // 왜: 멈추기 요청이 끊기면 그대로 만드는 중이다 — 상세의 [멈추기](prose)와 같은 말. 요청이 끝나면 "중단하는 중"을 내린다.
    expect(ko('Could not stop it. Try again.')).toBe('멈추지 못했어요. 다시 눌러 주세요.')
    const stopAll = stopAllSource()
    expect(stopAll).toContain("toast.error(t('Could not stop it. Try again.'))")
    expect(stopAll).toMatch(/finally \{\s*setStopRequested\(false\)/)
  })

  it('이미지 일괄을 멈추면 그 판이 이미 보낸 장도 화면에서 멈추고 "만들었어요" 알림을 띄우지 않는다', async () => {
    // 왜: [모두 멈추기]를 누르는 사이 막 보낸 장은 멈춘 목록에 없어 그 장만 "만드는 중"으로 남았다. 멈춘 판에 "N컷 만들었어요"도 틀린 말이다.
    let done = false
    const result = runRealBatch('p1').finally(() => { done = true })
    await vi.advanceTimersByTimeAsync(10)
    useDirectorCanvasStore.getState().cancelRealBatch()
    for (let i = 0; i < 600 && !done; i++) await vi.advanceTimersByTimeAsync(1000)
    await result
    const stops = calls.filter((c) => c.url === '/api/director/jobs/cancel')
    expect(stops.map((c) => c.body?.jobIds)).toContainEqual(['job-1'])
    expect(toast.success).not.toHaveBeenCalled()
  })
})

describe('누를 때 작업 목록 새로 읽기 (리드 검토 a 낮음)', () => {
  afterEach(() => {
    _setGenerationQueueSnapshotForTests({ projectId: '', jobs: [] })
  })

  it('[모두 멈추기]는 누를 때 작업 목록을 한 번 새로 읽어, 다른 탭 · 기기가 마지막 조회 뒤에 낸 낱개 작업도 멈춘다', async () => {
    // 왜: 저장해 둔 목록(쉴 때는 15초마다 읽음)만 쓰면 그사이 다른 탭 · 기기가 낸 작업은 멈추지 않고 계속 "만드는 중"이었다.
    _setGenerationQueueSnapshotForTests({ projectId: 'p1', jobs: [job('seen', 'shot_video')] })
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ ok: true, data: { jobs: [job('seen', 'shot_video'), job('other-tab', 'shot_storyboard')] } }), { status: 200 })
    }))
    expect((await freshActiveJobs('p1')).map((j) => j.id)).toEqual(['seen', 'other-tab'])
    expect(urls).toEqual(['/api/generation/active?projectId=p1'])
    expect(stopAllSource()).toContain('stoppableJobs(await freshActiveJobs(run.projectId))')
  })

  it('작업 목록을 새로 읽지 못하면 저장해 둔 목록으로 멈춘다', async () => {
    // 왜: 목록 읽기가 끊겨도 멈출 수 있는 것은 멈춘다(정상 경로 고정 — 예전처럼).
    _setGenerationQueueSnapshotForTests({ projectId: 'p1', jobs: [job('seen', 'shot_video')] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })))
    expect((await freshActiveJobs('p1')).map((j) => j.id)).toEqual(['seen'])
  })
})
