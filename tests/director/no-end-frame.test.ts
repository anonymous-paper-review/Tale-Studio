// 화면(노드 · Camera · 채팅 · 다시 만들기)과 일괄이 만드는 영상 요청에는 끝 그림이 없다 — 실사 끝 · 손으로 이은 끝 · 앞 영상 잇기 어느 경우든 (오너 2026-11-22 "Start, End 프레임 생성 방식 폐기")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: dbMocks.createClient }))
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: () => Promise.resolve(),
  loadShotsResult: () => Promise.resolve({ data: [], error: null }),
}))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { buildVideoBatchInputs } from '@/lib/director/video-batch-inputs'
import type { DirectorNode } from '@/types/director'

const START = 'https://media.example/shot-start.png'
const END = 'https://media.example/shot-end.png'
const SOURCE_END = 'https://media.example/source-end.png'
const CHAIN_FRAME = 'https://media.example/videos/clip-source/job-source_chain-frame.jpg'
const STORYBOARD = {
  url: START,
  status: 'completed',
  errorMessage: null,
  generatedAt: 1,
  frames: { start: START, direction: 'https://media.example/shot-direction.png', end: END },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** 그 영상 노드로 [만들기]를 눌렀을 때 화면이 보낸 요청 몸. */
async function sentBody(videoId: string): Promise<Record<string, unknown>> {
  const fetch = vi.fn()
    .mockResolvedValueOnce(jsonResponse({ jobId: 'job-1', status: 'queued' }))
    .mockResolvedValue(jsonResponse({ ok: true, data: { status: 'completed', resultUrl: 'https://media.example/video.mp4' } }))
  vi.stubGlobal('fetch', fetch)
  const result = useDirectorCanvasStore.getState().regenerateVideo(videoId)
  await Promise.resolve()
  await vi.runAllTimersAsync()
  await result
  return JSON.parse((fetch.mock.calls[0]![1] as RequestInit).body as string)
}

function setupShot() {
  const store = useDirectorCanvasStore.getState()
  useDirectorCanvasStore.setState({ projectId: 'project-1', hydrateFromDb: vi.fn().mockResolvedValue(undefined) })
  const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
  const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
  store.updateNodeData<'shot'>(shotId, { storyboardImage: STORYBOARD as never })
  return { store, sceneId, shotId }
}

const node = (id: string, data: Record<string, unknown>) => ({ id, type: String(data.kind), position: { x: 0, y: 0 }, data }) as unknown as DirectorNode

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
  vi.restoreAllMocks()
  dbMocks.createClient.mockReset()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('같이 정한 것', () => {
  // 왜: 오너 2026-11-22 "기존에 있던 Start, End 프레임 생성 방식은 일단 폐기" — 서버가 끝 그림을 빼도, 화면이 계속 보내면
  //   기록 · 화면에 끝 그림이 쓰인 것처럼 남는다. 실사 끝(자동) · 손으로 이은 끝 · 앞 영상 잇기 · 일괄 어느 쪽도 싣지 않는다.
  it('화면과 일괄이 만드는 영상 요청에도 끝 그림을 싣지 않는다 — 실사 끝 · 손으로 이은 끝 · 앞 영상 잇기', async () => {
    const { store, sceneId, shotId } = setupShot()

    const automatic = store.addVideoTake(shotId)!
    const auto = await sentBody(automatic)
    expect(auto.referenceImageUrls).toEqual([START])
    expect(auto.referenceImageRoles).toEqual(['start'])

    const source = store.addShotNode(sceneId, { x: 100, y: 560 }, 'Source')
    store.updateNodeData<'shot'>(source, { storyboardImage: { ...STORYBOARD, frames: { ...STORYBOARD.frames, end: SOURCE_END } } as never })
    const wired = store.addVideoTake(shotId)!
    store.wireFrameToVideo(source, wired, 'frame-end')
    const endOnly = await sentBody(wired)
    expect(endOnly.referenceImageUrls).toEqual([START])
    expect(endOnly.referenceImageRoles).toEqual(['start'])
    expect(endOnly.frameSource).toBe('auto')

    const sourceTake = store.addVideoTake(source)!
    store.updateNodeData<'video'>(sourceTake, { status: 'completed', videoUrl: 'https://media.example/videos/clip-source/job-source.mp4', videoClipId: 'clip-source', generationJobId: 'job-source' })
    const chained = store.addVideoTake(shotId)!
    store.updateNodeData<'video'>(chained, { videoChainInputId: sourceTake, videoChainFrameUrl: CHAIN_FRAME })
    const chain = await sentBody(chained)
    expect(chain.referenceImageUrls).toEqual([CHAIN_FRAME])
    expect(chain.referenceImageRoles).toEqual(['start'])

    const nodes: DirectorNode[] = [
      node('shot-a', { kind: 'shot', writerShotId: 'writer-a', prompt: 'p', provider: 'seedance', durationSeconds: 5, storyboardImage: STORYBOARD, referenceImages: [], imageInputs: [] }),
      node('asset-end', { kind: 'asset', imageUrl: SOURCE_END }),
      node('take-a', { kind: 'video', parentShotNodeId: 'shot-a', standaloneVideoKey: null, takeNumber: 1, createdAt: '2026-11-22T00:00:00Z', status: 'pending', videoUrl: null, frameInputs: { start: null, end: 'asset-end', refs: [] }, videoChainInputId: null, videoChainFrameUrl: null, override: {} }),
    ]
    const { items, skipped } = buildVideoBatchInputs('project-1', nodes, ['shot-a'])
    expect(skipped).toEqual([])
    expect(items[0]!.request.referenceImageUrls).toEqual([START])
    expect(items[0]!.request.referenceImageRoles).toEqual(['start'])
  })
})
