// 샷 상세 영상 탭에서 새 Take 를 만들면 고친 모델 · 해상도 · 바꿀 점이 새 Take 에만 실리는지 (디자이너 11/13 시안 D7 · 오너 2026-11-14)
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
let sourceId: string
let fetcher: ReturnType<typeof vi.fn>

const generationBodies = () => fetcher.mock.calls
  .filter(([url]) => String(url) === '/api/director/generate-video')
  .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>)

beforeEach(() => {
  vi.useFakeTimers()
  api().reset()
  useDirectorCanvasStore.setState({ projectId: 'project-1', hydrateFromDb: vi.fn().mockResolvedValue(undefined) })
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '샷 상세 Take')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A girl shivers under the eaves.', provider: 'seedance' })
  sourceId = api().addVideoTake(shotId)!
  api().updateNodeData<'video'>(sourceId, { videoClipId: 'clip-source', status: 'completed', videoUrl: 'https://media.test/source.mp4' })
  let clip = 0
  fetcher = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/director/generate-video') {
      clip += 1
      return Promise.resolve(Response.json({ jobId: `job-${clip}`, status: 'queued', videoClipId: `clip-${clip}`, takeNumber: clip + 1 }))
    }
    // 요청에 실린 값만 본다 — 생성처 결과는 바로 실패로 끝내 다음 단계(재생 · 판정)를 부르지 않는다.
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

describe('샷 상세의 새 Take', () => {
  it('영상 고치기에서 고친 모델 · 해상도 · 바꿀 점은 새 Take 의 생성 요청과 설정에 실리고, 보고 있던 Take 의 설정은 그대로다', async () => {
    // 왜: D7 — Take 는 덮어쓰지 않고 쌓인다. 영상 고치기에서 바꾼 것은 이번에 만드는 새 Take 의 것이고, 보고 있던 Take 는 그대로 다시 볼 수 있어야 한다.
    const prompt = 'A girl shivers under the eaves.\n\nChange from the previous video: slow push in'
    const newTakeId = await api().generateVideoForShot(shotId, {
      inheritFromVideoNodeId: sourceId,
      videoOverride: { provider: 'veo', resolution: '1080p', prompt },
    })

    expect(newTakeId).not.toBeNull()
    expect(newTakeId).not.toBe(sourceId)
    const [body] = generationBodies()
    expect(body).toMatchObject({ model: 'veo', resolution: '1080p', prompt, videoClipId: null, override: { provider: 'veo', resolution: '1080p', prompt } })
    const created = api().nodes.find((node) => node.id === newTakeId)!.data
    expect(isVideoData(created) && created.override).toEqual({ provider: 'veo', resolution: '1080p', prompt })
    const source = api().nodes.find((node) => node.id === sourceId)!.data
    expect(isVideoData(source) && source.override).toEqual({})
  })
})
