// 화면에서 멈추기 — 서버에 멈춤을 적고, 멈춘 Take 는 "멈춤"으로, 이미지를 만들던 샷은 지금 그림으로 돌아가며, 늦게 온 그림은 지금 그림을 바꾸지 않는다 (오너 2026-11-14 7번 · 리드 C · d)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const notify = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const chain = { from: () => chain, update: () => chain, eq: () => chain, then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve) }
    return chain
  },
}))
const queue = vi.hoisted(() => ({ refresh: vi.fn(), mark: vi.fn() }))
vi.mock('@/lib/generation-queue', async (original) => ({ ...await original<typeof import('@/lib/generation-queue')>(), refreshGenerationQueue: queue.refresh, markJobsCancelled: queue.mark }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: () => Promise.resolve() }))
vi.mock('@/lib/generation-notify', async (original) => ({ ...await original<typeof import('@/lib/generation-notify')>(), notifyStoppedResultKept: notify }))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import type { StoryboardImage, VideoNodeData } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()
const JOB_V = '11111111-1111-4111-8111-111111111111'
const JOB_I = '33333333-3333-4333-8333-333333333333'
const IMAGE: StoryboardImage = withStoryboardVersion(null, { id: 'job-0', url: 'https://media.test/now.png', frames: { start: 'https://media.test/now.png', direction: 'https://media.test/d.png', end: 'https://media.test/e.png' }, generatedAt: 1, source: 'generated' }, { select: true })
let shotId: string
let takeId: string

beforeEach(() => {
  vi.clearAllMocks()
  api().reset()
  useDirectorCanvasStore.setState({ projectId: '22222222-2222-4222-8222-222222222222', hydrateFromDb: vi.fn().mockResolvedValue(undefined) })
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '멈추기')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01', storyboardImage: IMAGE })
  takeId = api().addVideoTake(shotId)!
  api().updateNodeData<'video'>(takeId, { videoClipId: 'clip-1', generationJobId: JOB_V, status: 'generating', lastAttemptStatus: 'generating' })
})

afterEach(() => vi.unstubAllGlobals())

describe('화면에서 멈추기', () => {
  it('멈추면 서버에 멈춤을 적고, 그 Take 는 멈춘 것으로 보이며, 이미지를 만들던 샷은 지금 그림으로 돌아간다', async () => {
    // 왜: 오너 7번 — 멈춘 뒤 바로 고쳐 다시 요청할 수 있어야 한다. 이미지를 만들던 샷이 "만드는 중"으로 남으면 다시 만들기가 잠긴다.
    api().updateNodeData<'shot'>(shotId, { storyboardImage: { ...IMAGE, status: 'generating' } })
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { cancelled: [
      { jobId: JOB_V, kind: 'shot_video', writerShotIds: ['sh_01_01'], videoClipId: 'clip-1', cancelledAt: '2026-11-14T03:00:00Z' },
      { jobId: JOB_I, kind: 'shot_storyboard', writerShotIds: ['sh_01_01'], videoClipId: null, cancelledAt: '2026-11-14T03:00:00Z' },
    ] } }))
    vi.stubGlobal('fetch', fetcher)

    const stopped = await api().cancelRunningJobs([JOB_V, JOB_I])

    expect(stopped).toEqual([JOB_V, JOB_I])
    expect(fetcher).toHaveBeenCalledWith('/api/director/jobs/cancel', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String(fetcher.mock.calls[0]![1].body))).toEqual({ projectId: '22222222-2222-4222-8222-222222222222', jobIds: [JOB_V, JOB_I] })
    const take = api().nodes.find((n) => n.id === takeId)!.data as VideoNodeData
    expect(take.cancelledAt).toBe('2026-11-14T03:00:00Z')
    const shot = api().nodes.find((n) => n.id === shotId)!.data as { storyboardImage: StoryboardImage }
    expect(shot.storyboardImage).toMatchObject({ status: 'completed', url: 'https://media.test/now.png', versionId: 'job-0' })
    expect(queue.mark).toHaveBeenCalledWith([JOB_V, JOB_I], '2026-11-14T03:00:00Z')
  })

  it('멈춘 이미지 작업의 그림이 뒤늦게 와도 화면의 지금 그림을 바꾸지 않고, 채팅에 기록에만 남겼다고 한 줄 알린다', async () => {
    // 왜: 오너 7번 "백그라운드에서 끝나면 히스토리로" · 리드 d "목록에 들어오면 채팅 한 줄" — 늦은 그림이 지금 그림을 덮으면 고쳐 다시 만든 그림이 사라진다.
    let finish!: () => void
    const finished = new Promise<void>((resolve) => { finish = resolve })
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/director/generate-storyboard') return Response.json({ jobId: JOB_I })
      if (url === `/api/generation-jobs/${JOB_I}`) { await finished; return Response.json({ ok: true, data: { status: 'completed', resultUrl: 'https://media.test/late.png', error: null } }) }
      if (url === '/api/director/jobs/cancel') return Response.json({ ok: true, data: { cancelled: [{ jobId: JOB_I, kind: 'shot_storyboard', writerShotIds: ['sh_01_01'], videoClipId: null, cancelledAt: '2026-11-14T03:00:00Z' }] } })
      return Response.json({ ok: true })
    })
    vi.stubGlobal('fetch', fetcher)

    const running = api().generateStoryboardImage(shotId)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledWith(`/api/generation-jobs/${JOB_I}`))
    await api().cancelRunningJobs([JOB_I])
    finish()
    const result = await running

    expect(result).toMatchObject({ jobId: JOB_I, status: 'cancelled' })
    const shot = api().nodes.find((n) => n.id === shotId)!.data as { storyboardImage: StoryboardImage }
    expect(shot.storyboardImage.url).toBe('https://media.test/now.png')
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('멈춘 Take 가 뒤늦게 끝나도 채팅에 Take 목록에만 남았다고 한 줄 알리고 완료 알림은 하지 않는다', () => {
    // 왜: 리드 d — 영상도 이미지와 같은 규칙. 완료 알림("영상이 완성됐어요")이 뜨면 Editor 로 가는 영상이 바뀐 줄 안다.
    const store = readFileSync('src/stores/director-store.ts', 'utf8')
    expect(store).toMatch(/status === 'completed' && stoppedJobIds\.has\(jobId\)\) \{[\s\S]{0,600}notifyStoppedResultKept\('director'[\s\S]{0,400}return true/)
  })
})
