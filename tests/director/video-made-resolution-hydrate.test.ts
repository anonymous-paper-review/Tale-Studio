// 서버에서 다시 읽어 온 영상 노드는 지금 영상이 몇 p 로 만들어졌는지 기억한다 — 같은 영상이면 잠깐 모를 때도 잃지 않는다 (2026-10-31 리뷰)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: dbMocks.createClient }))
// shots 읽기는 공유 사물함(@/lib/shots-cache)을 지난다 — 이 시험은 장면 · 샷이 비어 있는 다리로 둔다.
vi.mock('@/lib/shots-cache', () => ({
  invalidateShots: () => Promise.resolve(),
  loadShotsResult: () => Promise.resolve({ data: [], error: null }),
}))

import { useDirectorCanvasStore } from '@/stores/director-store'
import { isVideoData } from '@/types/director'

const VIDEO_1080 = 'https://media.example/videos/clip-1/job-hd.mp4'
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
    override: { resolution: '1080p' },
    canvas_position: null,
    is_final: false,
    url: VIDEO_1080,
    thumbnail_url: null,
    status: 'completed',
    latestJobId: 'job-hd',
    latestJobStatus: 'completed',
    latestJobError: null,
    latestAttemptAt: '2026-10-31T00:00:00.000Z',
    last_attempt_status: 'completed',
    last_attempt_error: null,
    last_attempt_at: '2026-10-31T00:00:00.000Z',
    created_at: '2026-10-31T00:00:00.000Z',
    updated_at: '2026-10-31T00:00:00.000Z',
    ...patch,
  }
}

async function hydrateWith(row: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ takes: [row] })))
  await useDirectorCanvasStore.getState().hydrateFromDb('project-1')
}

let videoId: string
function made(): unknown {
  const node = useDirectorCanvasStore.getState().nodes.find((candidate) => candidate.id === videoId)!
  return isVideoData(node.data) ? node.data.videoResolution : 'not a video'
}

beforeEach(() => {
  useDirectorCanvasStore.getState().reset()
  dbMocks.createClient.mockReset()
  dbMocks.createClient.mockReturnValue(hydrationClient())
  const store = useDirectorCanvasStore.getState()
  useDirectorCanvasStore.setState({ projectId: 'project-1' })
  const sceneId = store.addSceneNode({ x: 0, y: 0 }, 'Scene')
  const shotId = store.addShotNode(sceneId, { x: 100, y: 0 }, 'Shot')
  videoId = store.addVideoTake(shotId)!
  store.updateNodeData<'video'>(videoId, { videoClipId: 'clip-1' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('혼자 정한 것', () => {
  // 왜: 새로 고치거나 다른 기기에서 열어도 노드의 1080p 표시가 그 영상이 만들어진 그대로 보여야 한다.
  //   다시 만드는 중에는 서버가 지금 영상의 해상도를 모를 수 있다 — 영상 파일이 그대로면 아는 값을 지우지 않는다.
  it('다시 읽어 온 영상 노드는 지금 영상이 만들어진 해상도를 기억하고, 같은 영상이면 잠깐 모를 때도 잃지 않으며, 영상이 바뀌면 새 영상 기준으로 본다', async () => {
    await hydrateWith(takeRow({ video_resolution: '1080p' }))
    expect(made()).toBe('1080p')

    await hydrateWith(takeRow({ video_resolution: null, latestJobId: 'job-next', latestJobStatus: 'generating', last_attempt_status: 'queued' }))
    expect(made()).toBe('1080p')

    await hydrateWith(takeRow({ url: VIDEO_NEXT, video_resolution: null }))
    expect(made()).toBeNull()
  })
})
