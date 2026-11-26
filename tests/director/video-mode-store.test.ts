// Take 에 적힌 만드는 방식은 영상 요청에 실리고, 노드에서 손으로 이은 그림이 있으면 손 배선이 이긴다 (오너 2026-11-27 N4a)
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

import { parseMadeFrames, useDirectorCanvasStore } from '@/stores/director-store'
import { isVideoData } from '@/types/director'

const api = () => useDirectorCanvasStore.getState()
const CONTINUE_FROM = { videoClipId: 'clip-prev', generationJobId: 'job-prev', frameUrl: 'https://media.test/clip-prev/job-prev_chain-frame-2850.jpg' }
let shotId: string
let videoId: string
let fetcher: ReturnType<typeof vi.fn>

const generationBodies = () => fetcher.mock.calls
  .filter(([url]) => url === '/api/director/generate-video')
  .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>)

beforeEach(() => {
  vi.useFakeTimers()
  api().reset()
  useDirectorCanvasStore.setState({ projectId: 'project-1', hydrateFromDb: vi.fn().mockResolvedValue(undefined) })
  shotId = api().addShotNode(null, { x: 0, y: 0 }, 'Mode')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A quiet harbor at dawn', provider: 'seedance' })
  videoId = api().addVideoTake(shotId)!
  fetcher = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/director/generate-video') return Promise.resolve(Response.json({ jobId: 'job-1', status: 'queued', videoClipId: 'clip-1', takeNumber: 1 }))
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

describe('같이 정한 것', () => {
  // 왜(검토 rev-video 3 · 리드 결정 "사람이 그 자리에서 고른 방식이 이김"): 보던 Take 를 노드에서 손으로 이어 두었으면 새 Take 가 그 배선 · 체인을 물려받아
  //   샷 상세에서 고른 방식이 소리 없이 버려졌다(손 배선이 이기면 방식을 보내지 않는다). 샷 상세는 고른 방식을 칩으로 보이니 보이는 대로 만든다.
  it('샷 상세에서 방식을 골라 만든 새 Take 는 보던 Take 의 손 배선 · 영상 체인을 물려받지 않고 고른 방식으로 만든다', async () => {
    const sourceId = api().addVideoTake(shotId)!
    api().updateNodeData<'video'>(sourceId, { status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://media.test/videos/clip-src/job-src.mp4', videoClipId: 'clip-src', generationJobId: 'job-src' })
    api().updateNodeData<'video'>(videoId, {
      status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://media.test/videos/clip-viewed/job-viewed.mp4', videoClipId: 'clip-viewed', generationJobId: 'job-viewed',
      frameInputs: { start: shotId, end: null, refs: [] }, videoChainInputId: sourceId, videoChainFrameUrl: 'https://media.test/videos/clip-src/job-src_chain-frame-2850.jpg',
    })
    const before = new Set(api().nodes.map((node) => node.id))
    await api().remakeShotVideo(shotId, { fromTakeId: videoId, videoOverride: { videoMode: 'reference' } })

    const [body] = generationBodies()
    expect(body).toMatchObject({ videoMode: 'reference', frameSource: 'auto' })
    expect(body).not.toHaveProperty('referenceImageUrls')
    const created = api().nodes.find((node) => !before.has(node.id) && isVideoData(node.data))
    expect(created?.data).toMatchObject({ frameInputs: { start: null, end: null, refs: [] }, videoChainInputId: null, videoChainFrameUrl: null })
  })

  // 왜(검토 rev-video C): Take 줄이 판 id 로 쓴 판을 찾으려면 Take 목록을 다시 읽을 때 그 id 가 화면의 Take 에 남아야 한다.
  it('Take 목록이 알려 준 판 id 는 화면의 Take 에도 쓴 그림과 함께 남는다', () => {
    expect(parseMadeFrames({ start: 'https://media.test/a-s.png', end: null, versionId: 'arrows-1' })).toEqual({ start: 'https://media.test/a-s.png', end: null, versionId: 'arrows-1' })
    expect(parseMadeFrames({ start: 'https://media.test/a-s.png', end: null })).toEqual({ start: 'https://media.test/a-s.png', end: null })
    expect(parseMadeFrames({ start: null, end: null, versionId: 'arrows-1' })).toBeNull()
  })

  // 왜(리드 결정): 노드 Take 판 [다시 만들기]는 그 Take 를 그대로 다시 만든다 — 노드에서 손으로 이은 그림이 그 자리에서 사람이 한 것이라 손 배선이 이긴다.
  it('노드 Take 판에서 같은 Take 를 다시 만들면 그 Take 의 손 배선이 그대로 이긴다', async () => {
    api().updateNodeData<'video'>(videoId, {
      status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://media.test/videos/clip-viewed/job-viewed.mp4', videoClipId: 'clip-viewed', generationJobId: 'job-viewed',
      override: { videoMode: 'reference' }, frameInputs: { start: shotId, end: null, refs: [] },
    })
    await api().regenerateVideo(videoId)

    const [body] = generationBodies()
    expect(body).toMatchObject({ frameSource: 'manual' })
    expect(body).not.toHaveProperty('videoMode')
    expect(api().nodes.find((node) => node.id === videoId)?.data).toMatchObject({ frameInputs: { start: shotId, end: null, refs: [] } })
  })
})

describe('혼자 정한 것', () => {
  // 왜: 샷 상세에서 방식을 골라 만든 Take 를 노드 · Lumi · 넘기기 창에서 [다시 만들기]해도 같은 방식으로 만들어야 한다.
  //   이어서는 기록된 출처를 그대로 보낸다 — 앞 샷 영상이 그대로인지는 서버가 확인한다.
  it('Take 에 고른 방식을 영상 요청에 싣고, 이어서는 기록된 출처를 그대로 싣는다', async () => {
    api().applyVideoOverride(videoId, { videoMode: 'start_prompt' })
    await api().regenerateVideo(videoId)
    api().applyVideoOverride(videoId, { videoMode: 'continue', continueFrom: CONTINUE_FROM })
    await api().regenerateVideo(videoId)

    const [first, second] = generationBodies()
    expect(first).toMatchObject({ videoMode: 'start_prompt', override: { videoMode: 'start_prompt' } })
    expect(first).not.toHaveProperty('continueFrom')
    expect(second).toMatchObject({ videoMode: 'continue', continueFrom: CONTINUE_FROM })
  })

  // 왜: 샷 상세에서 방식을 고른 Take 를 노드에서 손으로 다시 이으면 사람이 마지막에 한 것(손 배선)이 이긴다 —
  //   방식을 함께 보내면 서버가 손으로 이은 그림을 버리고, 새 Take 기록에도 쓰지 않은 방식이 남는다.
  it('노드에서 손으로 그림을 이은 Take 는 방식을 보내지 않고 새 Take 기록에서도 지운다', async () => {
    api().applyVideoOverride(videoId, { videoMode: 'reference' })
    api().updateNodeData<'video'>(videoId, { frameInputs: { start: shotId, end: null, refs: [] } })
    await api().regenerateVideo(videoId)

    const [body] = generationBodies()
    expect(body).not.toHaveProperty('videoMode')
    expect((body!.override as Record<string, unknown>) ?? {}).not.toHaveProperty('videoMode')
  })
})
