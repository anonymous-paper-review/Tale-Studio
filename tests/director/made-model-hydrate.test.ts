// 다시 읽어 온 영상 노드는 그 영상을 실제로 만든 모델을 기억한다 — 같은 영상이면 잠깐 모를 때도 잃지 않고, 다시 만들 때의 모델은 그대로다 (리드 2026-11-22)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: dbMocks.createClient }))
// shots 읽기는 공유 사물함(@/lib/shots-cache)을 지난다 — 이 시험은 샷 하나(shot-1)만 있는 다리로 둔다.
//   DB 에 없는 샷의 노드는 다시 읽을 때 빠지므로, 캔버스에 없던 Take 가 붙을 샷이 남아 있게 한다.
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: () => Promise.resolve(),
  loadShotsResult: () => Promise.resolve({ data: [{ shot_id: 'shot-1', canvas_position: null, storyboard_image: null }], error: null }),
}))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { takeSettings } from '@/lib/director/remake-take'
import { isVideoData, type VideoNodeData } from '@/types/director'

const VIDEO = 'https://media.example/videos/clip-1/job-hh.mp4'
const VIDEO_NEXT = 'https://media.example/videos/clip-1/job-next.mp4'

function hydrationClient() {
  return {
    from: vi.fn(() => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      }
      return chain
    }),
  }
}

function takeRow(patch: Record<string, unknown>) {
  return {
    id: 'clip-1',
    shot_id: 'shot-1',
    take_number: 1,
    take_label: 'Take 1',
    override: {},
    canvas_position: null,
    is_final: false,
    url: VIDEO,
    thumbnail_url: null,
    status: 'completed',
    latestJobId: 'job-hh',
    latestJobStatus: 'completed',
    latestJobError: null,
    latestAttemptAt: '2026-11-22T00:00:00.000Z',
    last_attempt_status: 'completed',
    last_attempt_error: null,
    last_attempt_at: '2026-11-22T00:00:00.000Z',
    created_at: '2026-11-22T00:00:00.000Z',
    updated_at: '2026-11-22T00:00:00.000Z',
    ...patch,
  }
}

async function hydrateWith(row: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ takes: [row] })))
  await useDirectorCanvasStore.getState().hydrateFromDb('project-1')
}

function madeModelOfClip(clipId: string): unknown {
  const node = useDirectorCanvasStore.getState().nodes.find((candidate) => isVideoData(candidate.data) && candidate.data.videoClipId === clipId)
  if (!node) return 'no take node'
  return isVideoData(node.data) ? node.data.madeModel : 'not a video'
}

let shotId: string
beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
  dbMocks.createClient.mockReset()
  dbMocks.createClient.mockReturnValue(hydrationClient())
  const store = useDirectorCanvasStore.getState()
  useDirectorCanvasStore.setState({ projectId: 'project-1' })
  const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
  shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
  store.updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('혼자 정한 것', () => {
  // 왜: 새로 고치거나 다른 기기에서 열어도 판의 모델 이름이 그 영상을 만든 모델 그대로여야 한다.
  //   다시 만드는 중에는 서버가 지금 영상의 모델을 모를 수 있다 — 영상 파일이 그대로면 아는 값을 지우지 않는다(해상도 표시와 같은 규칙).
  it('다시 읽어 온 영상 노드는 만든 모델을 기억하고, 같은 영상이면 잠깐 모를 때도 잃지 않으며, 영상이 바뀌면 새 영상 기준으로 본다', async () => {
    const videoId = useDirectorCanvasStore.getState().addVideoTake(shotId)!
    useDirectorCanvasStore.getState().updateNodeData<'video'>(videoId, { videoClipId: 'clip-1' })

    await hydrateWith(takeRow({ made_model: 'happy-horse' }))
    expect(madeModelOfClip('clip-1')).toBe('happy-horse')

    await hydrateWith(takeRow({ made_model: null, latestJobId: 'job-next', latestJobStatus: 'generating', last_attempt_status: 'queued' }))
    expect(madeModelOfClip('clip-1')).toBe('happy-horse')

    await hydrateWith(takeRow({ url: VIDEO_NEXT, made_model: null }))
    expect(madeModelOfClip('clip-1')).toBeNull()
  })

  // 왜: 다른 곳(일괄 · 채팅 · 다른 기기)에서 만든 Take 는 캔버스에 없다가 다시 읽을 때 새로 놓인다 — 그때도 같은 이름이어야 한다.
  //   모르는 모델 이름은 싣지 않는다(판이 모델 목록에서 이름을 찾다 깨지지 않게).
  it('캔버스에 아직 없던 Take 를 다시 읽어 와 새로 놓을 때도 만든 모델을 싣고, 모르는 모델 이름은 싣지 않는다', async () => {
    await hydrateWith(takeRow({ made_model: 'happy-horse' }))
    expect(madeModelOfClip('clip-1')).toBe('happy-horse')

    useDirectorCanvasStore.getState().reset()
    useDirectorCanvasStore.setState({ projectId: 'project-1' })
    const store = useDirectorCanvasStore.getState()
    const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
    store.updateNodeData<'shot'>(store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot'), { writerShotId: 'shot-1' })
    await hydrateWith(takeRow({ made_model: 'minimax' }))
    expect(madeModelOfClip('clip-1')).toBeNull()
  })

  // 왜: 리드 2026-11-22 — 보이는 이름만 맞춘다. 다시 만들기가 "만든 모델"을 따라가면, 고른 모델이 실패해 다른 모델로 넘어갔던 Take 가
  //   사람이 고르지 않은 모델로 다시 만들어진다.
  it('만든 모델이 실려도 다시 만들기 · 다음 Take 의 모델은 Take 에 고른 값과 샷 설정 그대로다', () => {
    const plain: Pick<VideoNodeData, 'override' | 'madeModel'> = { override: {}, madeModel: 'happy-horse' }
    const chosen: Pick<VideoNodeData, 'override' | 'madeModel'> = { override: { provider: 'kling-o3' }, madeModel: 'happy-horse' }

    expect(takeSettings({ provider: 'seedance' }, plain).model).toBe('seedance')
    expect(takeSettings({ provider: 'seedance' }, chosen).model).toBe('kling-o3')
  })
})
