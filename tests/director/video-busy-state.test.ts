// 다른 요청에서 같은 샷의 영상을 생성 중이면 추가 카드를 남기거나 기존 영상을 실패로 바꾸지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { isVideoData } from '@/types/director'

const queue = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('@/lib/generation-queue', () => ({ refreshGenerationQueue: queue.refresh }))
const originalHydrate = useDirectorCanvasStore.getState().hydrateFreshFromDb
const api = () => useDirectorCanvasStore.getState()
let shotId: string
let fetcher: ReturnType<typeof vi.fn>
let hydrate: ReturnType<typeof vi.fn<() => Promise<void>>>

beforeEach(() => {
  vi.useFakeTimers()
  api().reset()
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '동시 생성 검증')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A quiet mountain' })
  hydrate = vi.fn().mockResolvedValue(undefined)
  useDirectorCanvasStore.setState({ projectId: 'project-1', hydrateFreshFromDb: hydrate })
  fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({
    error: 'A video is already being generated for this shot.', code: 'director_video_shot_busy',
    existingJobId: '123e4567-e89b-42d3-a456-426614174011', status: 'queued',
  }, { status: 409 })))
  vi.stubGlobal('fetch', fetcher)
  queue.refresh.mockClear()
  vi.spyOn(toast, 'info').mockReturnValue('notice')
})

afterEach(() => {
  useDirectorCanvasStore.setState({ hydrateFreshFromDb: originalHydrate })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('다른 요청이 같은 샷의 영상을 생성 중이면 새 카드를 남기지 않고 진행 작업을 다시 확인한다', async () => {
  expect(await api().generateVideoForShot(shotId)).toBeNull()
  expect(api().nodes.filter(node => isVideoData(node.data))).toHaveLength(0)
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/director/generate-video')).toHaveLength(1)
  expect(queue.refresh).toHaveBeenCalled()
  expect(hydrate).toHaveBeenCalledOnce()
  expect(toast.info).toHaveBeenCalledOnce()
})

it('다른 요청이 같은 샷의 영상을 생성 중이면 기존 완료 영상을 유지하고 실패로 표시하지 않는다', async () => {
  const videoId = api().addVideoTake(shotId)!
  api().updateNodeData<'video'>(videoId, {
    videoClipId: 'existing-clip', videoUrl: 'https://example.test/completed.mp4',
    status: 'completed', lastAttemptStatus: 'completed', generationJobId: 'previous-job',
  })
  expect(await api().regenerateVideo(videoId)).toBe(false)
  const data = api().nodes.find(node => node.id === videoId)?.data
  expect(data).toMatchObject({ videoClipId: 'existing-clip', videoUrl: 'https://example.test/completed.mp4',
    status: 'completed', lastAttemptStatus: 'completed', generationJobId: 'previous-job', lastAttemptError: null })
  expect(hydrate).toHaveBeenCalledOnce()
  expect(queue.refresh).toHaveBeenCalled()
})
