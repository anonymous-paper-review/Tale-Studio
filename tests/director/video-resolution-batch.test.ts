// "모든 샷 영상 만들기"도 각 샷이 쓸 영상 노드의 해상도로 만들고, 확인 창의 Take 합계에 그 해상도를 반영한다 (오너 2026-10-31 1080p)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), owns: vi.fn(), prepare: vi.fn(), create: vi.fn(), get: vi.fn(), after: vi.fn(),
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/director/video-submit', () => ({ prepareDirectorVideoSubmission: mocks.prepare }))
vi.mock('@/lib/director/batch-store', () => ({
  createVideoBatch: mocks.create,
  getVideoBatchSummary: mocks.get,
  listVideoBatchSummaries: vi.fn(),
  cancelVideoBatch: vi.fn(),
}))
vi.mock('@/lib/director/batch-continue', () => ({ continueVideoBatch: vi.fn() }))
vi.mock('next/server', async (original) => ({
  ...await original<typeof import('next/server')>(),
  after: mocks.after,
}))

import type { DirectorNode } from '@/types/director'
import { buildVideoBatchInputs } from '@/lib/director/video-batch-inputs'
import { videoBatchTakeCosts } from '@/lib/director/video-batch-plan'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import type { VideoModelKey } from '@/lib/video-models'
import { POST } from '@/app/api/director/video-batches/route'

function node(id: string, data: Record<string, unknown>): DirectorNode {
  return { id, type: String(data.kind), position: { x: 0, y: 0 }, data } as unknown as DirectorNode
}
function shot(id: string, provider = 'seedance'): DirectorNode {
  return node(id, {
    kind: 'shot',
    writerShotId: `writer-${id}`,
    prompt: 'base prompt',
    camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 },
    lighting: { position: 'front', brightness: 50, colorTemp: 5600 },
    cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 },
    provider,
    durationSeconds: 5,
    storyboardImage: null,
    referenceImages: [],
    imageInputs: [],
  })
}
/** 아직 완성 영상이 없고 사람이 시작 그림을 이은 테이크 — 일괄이 이 테이크의 설정을 쓴다. */
function wiredTake(id: string, parentShotNodeId: string, override: Record<string, unknown>): DirectorNode {
  return node(id, {
    kind: 'video',
    parentShotNodeId,
    standaloneVideoKey: null,
    takeNumber: 1,
    createdAt: '2026-10-31T00:00:00Z',
    status: 'failed',
    videoUrl: null,
    frameInputs: { start: 'asset-start', end: null, refs: [] },
    videoChainInputId: null,
    videoChainFrameUrl: null,
    override,
  })
}
const START_ASSET = node('asset-start', { kind: 'asset', imageUrl: 'https://cdn.test/start.png' })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' })
  mocks.owns.mockResolvedValue(true)
  mocks.get.mockResolvedValue(null)
  mocks.create.mockResolvedValue({ id: 'batch', projectId: 'project', status: 'completed' })
  mocks.prepare.mockImplementation(async (req: Request, ownerId: string) => ({ ownerId, inputSnapshot: await req.json() }))
})

describe('혼자 정한 것', () => {
  // 왜: 사람이 그림을 이어 둔 테이크를 1080p 로 맞춰 두고 [모든 샷 영상 만들기]를 누를 때 — 그 테이크의 설정대로 만든다.
  it('그림을 이어 둔 테이크가 1080p면 모든 샷 영상 만들기도 그 샷을 1080p로 만든다', () => {
    const nodes = [shot('shot-1'), wiredTake('take-1', 'shot-1', { resolution: '1080p' }), START_ASSET]

    const { items } = buildVideoBatchInputs('project-1', nodes, ['shot-1'])

    expect(items).toHaveLength(1)
    expect(items[0]!.request).toMatchObject({ model: 'seedance', resolution: '1080p' })
  })

  // 왜: 그림을 잇지 않은 샷은 일괄이 마더 샷 설정으로 새 테이크를 만든다 — 마더 샷에는 해상도가 없으니 지금과 같은 720p, 정상 경로 고정.
  it('그림을 잇지 않은 샷은 모든 샷 영상 만들기를 지금처럼 720p로 만든다', () => {
    const { items } = buildVideoBatchInputs('project-1', [shot('shot-1')], ['shot-1'])

    expect(items[0]!.request).toMatchObject({ model: 'seedance', resolution: '720p' })
  })

  // 왜: 확인 창이 "필요한 Take"를 적고 서버가 샷마다 그만큼 잡는다 — 두 숫자가 다르면 종량제 신뢰가 깨진다.
  it('일괄 확인 창의 Take 합계도 각 샷 요청의 모델과 해상도를 따라 두 배로 센다', () => {
    const nodes = [
      shot('shot-plain'),
      shot('shot-hd'),
      wiredTake('take-hd', 'shot-hd', { resolution: '1080p' }),
      shot('shot-horse'),
      wiredTake('take-horse', 'shot-horse', { provider: 'happy-horse', resolution: '1080p' }),
      START_ASSET,
    ]
    const shotIds = ['shot-plain', 'shot-hd', 'shot-horse']

    const costs = videoBatchTakeCosts(nodes, shotIds)
    expect(costs).toEqual([5, 10, 2])
    const { items } = buildVideoBatchInputs('project-1', nodes, shotIds)
    expect(items.map((item) => takeCostForVideo(item.request.model as VideoModelKey, item.request.resolution as string))).toEqual(costs)
  })

  // 왜: 일괄은 서버가 입력을 저장해 두었다가 이어서 낸다 — 해상도가 그 저장 입력에서 빠지면 1080p 를 고르고도 720p 로 나간다.
  it('일괄 요청에 실린 해상도는 서버가 입력을 준비할 때까지 그대로 간다', async () => {
    const response = await POST(new Request('http://test/api/director/video-batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        batchId: '22222222-2222-4222-8222-222222222222',
        projectId: '11111111-1111-4111-8111-111111111111',
        items: [{ shotId: 'shot-1', request: { prompt: 'A harbor', model: 'seedance', resolution: '1080p' } }],
      }),
    }))

    expect(response.status).toBe(200)
    const prepared = mocks.create.mock.calls[0][0].items[0].prepared
    expect(prepared.inputSnapshot).toMatchObject({ model: 'seedance', resolution: '1080p' })
  })
})
