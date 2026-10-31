// 고른 해상도는 그 영상 노드 설정에 남고, 영상을 만들거나 다시 찍을 때 요청에 실린다 (오너 2026-10-31 1080p)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const chain = {
      from: () => chain,
      update: () => chain,
      eq: () => chain,
      then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }
    return chain
  },
}))
vi.mock('@/lib/generation-queue', () => ({ refreshGenerationQueue: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: () => Promise.resolve() }))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { isVideoData } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()
let shotId: string
let videoId: string
let fetcher: ReturnType<typeof vi.fn>

type Call = { url: string; method: string; body: Record<string, unknown> | null }
function calls(): Call[] {
  return fetcher.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit | undefined)?.method ?? 'GET',
    body: typeof (init as RequestInit | undefined)?.body === 'string' ? JSON.parse((init as RequestInit).body as string) : null,
  }))
}
const generationBodies = () => calls().filter((call) => call.url === '/api/director/generate-video').map((call) => call.body!)

beforeEach(() => {
  vi.useFakeTimers()
  api().reset()
  useDirectorCanvasStore.setState({ projectId: 'project-1', hydrateFromDb: vi.fn().mockResolvedValue(undefined) })
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '해상도 검증')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A quiet harbor at dawn', provider: 'seedance' })
  videoId = api().addVideoTake(shotId)!
  let clip = 0
  fetcher = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/director/generate-video') {
      clip += 1
      return Promise.resolve(Response.json({ jobId: `job-${clip}`, status: 'queued', videoClipId: `clip-${clip}`, takeNumber: clip }))
    }
    // 이 시험은 요청에 실린 값만 본다 — 생성처 결과는 바로 실패로 끝내 다음 단계(재생 · 판정)를 부르지 않는다.
    if (url.startsWith('/api/generation-jobs/')) return Promise.resolve(Response.json({ ok: true, data: { status: 'failed', error: 'stopped by test' } }))
    return Promise.resolve(Response.json({ ok: true }))
  })
  vi.stubGlobal('fetch', fetcher)
})

afterEach(async () => {
  await vi.runAllTimersAsync()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('혼자 정한 것', () => {
  // 왜: 해상도를 손대지 않은 영상 노드에서 [영상 생성]을 누를 때 — 지금과 같은 720p, 정상 경로 고정.
  it('처음은 720p로 만들어 달라고 요청한다', async () => {
    await api().regenerateVideo(videoId)

    expect(generationBodies()).toHaveLength(1)
    expect(generationBodies()[0]).toMatchObject({ model: 'seedance', resolution: '720p' })
  })

  // 왜: 1080p 를 고른 뒤 영상을 만들고, 마음에 안 들어 같은 노드에서 [영상 재생성]을 다시 누를 때.
  it('1080p를 고르면 그 영상 노드 설정에 남아 다시 만들 때도 1080p로 요청한다', async () => {
    api().applyVideoOverride(videoId, { resolution: '1080p' })

    await api().regenerateVideo(videoId)
    await api().regenerateVideo(videoId)

    const bodies = generationBodies()
    expect(bodies).toHaveLength(2)
    expect(bodies.map((body) => body.resolution)).toEqual(['1080p', '1080p'])
    // 두 번째는 첫 번째로 저장된 같은 영상(clip-1)을 다시 만드는 요청이다.
    expect(bodies[1]).toMatchObject({ videoClipId: 'clip-1' })
    const data = api().nodes.find((node) => node.id === videoId)!.data
    expect(isVideoData(data) && data.override).toMatchObject({ resolution: '1080p' })
  })

  // 왜: 화면을 새로 고치거나 다른 기기에서 열어도 고른 해상도가 남아 있어야 한다 — 영상 노드 설정은 서버에 저장된다.
  it('저장된 영상 노드에서 해상도를 고르면 그 설정을 서버에 저장한다', async () => {
    api().updateNodeData<'video'>(videoId, { videoClipId: 'clip-saved' })

    api().applyVideoOverride(videoId, { resolution: '1080p' })
    await vi.advanceTimersByTimeAsync(600)

    const saves = calls().filter((call) => call.url === '/api/director/video-takes/clip-saved' && call.method === 'PATCH')
    expect(saves).toHaveLength(1)
    expect(saves[0]!.body).toMatchObject({ projectId: 'project-1', override: { resolution: '1080p' } })
  })

  // 왜: 1080p 로 만든 영상 노드에서 [영상 리테이크]를 누를 때 — 새 테이크도 1080p 로 만들고, 새로 고친 뒤에도 그 테이크가 1080p 로 보여야 한다.
  it('다시 찍기로 만든 새 테이크는 원본 테이크의 해상도를 물려받고 그 설정을 서버에도 남긴다', async () => {
    api().updateNodeData<'video'>(videoId, { videoClipId: 'clip-source', status: 'completed', videoUrl: 'https://media.test/source.mp4' })
    api().applyVideoOverride(videoId, { resolution: '1080p' })

    const newTakeId = await api().generateVideoForShot(shotId, { inheritFromVideoNodeId: videoId })

    expect(newTakeId).not.toBeNull()
    expect(newTakeId).not.toBe(videoId)
    const [body] = generationBodies()
    expect(body).toMatchObject({ resolution: '1080p', override: { resolution: '1080p' } })
    expect(body!.videoClipId).toBeNull()
  })
})
