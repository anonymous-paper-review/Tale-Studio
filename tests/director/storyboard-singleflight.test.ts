// 같은 샷의 이미지 작업은 끝날 때까지 한 번만 접수하고, 응답을 잃어도 다시 제출하지 않는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { resetActionGuard } from '@/lib/action-guard'

const shots = vi.hoisted(() => ({ invalidate: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: shots.invalidate, loadShotsResult: shots.load }))

const pending = () => new Promise<Response>(() => {})
let shotId: string
const api = () => useDirectorCanvasStore.getState()
const hydrateFromDb = api().hydrateFromDb

beforeEach(() => {
  vi.useFakeTimers()
  shots.invalidate.mockReset().mockResolvedValue(undefined)
  shots.load.mockReset()
  resetActionGuard()
  api().reset()
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '검증용 샷')
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1', promptOverride: 'A landscape' })
  useDirectorCanvasStore.setState({ projectId: crypto.randomUUID(), viewMode: 'node' })
})

afterEach(() => {
  useDirectorCanvasStore.setState({ hydrateFromDb })
  vi.unstubAllGlobals(); vi.useRealTimers()
})

it('이미지 생성이 끝나지 않았으면 1초 뒤 다시 눌러도 추가 요청을 보내지 않는다', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(pending)
  vi.stubGlobal('fetch', fetch)
  void api().generateStoryboardImage(shotId)
  await vi.advanceTimersByTimeAsync(1500)
  void api().generateStoryboardImage(shotId)
  expect(fetch.mock.calls.filter(([url]) => String(url) === '/api/director/generate-storyboard')).toHaveLength(1)
})

it('이미지 요청의 응답을 잃으면 진행 상태를 유지하고 다시 제출하지 않는다', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
  vi.stubGlobal('fetch', fetch)
  await api().generateStoryboardImage(shotId)
  expect(api().nodes.find((node) => node.id === shotId)?.data).toMatchObject({ storyboardImage: { status: 'generating' } })
  await vi.advanceTimersByTimeAsync(1500)
  await api().generateStoryboardImage(shotId)
  expect(fetch.mock.calls.filter(([url]) => String(url) === '/api/director/generate-storyboard')).toHaveLength(1)
})

it('서버가 이미지 요청을 명확히 거절하면 실패를 알리고 다시 시도할 수 있다', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'Invalid prompt' }, { status: 400 }))
  vi.stubGlobal('fetch', fetch)
  await api().generateStoryboardImage(shotId)
  expect(api().nodes.find((node) => node.id === shotId)?.data).toMatchObject({ storyboardImage: { status: 'failed' } })
  await api().generateStoryboardImage(shotId)
  expect(fetch.mock.calls.filter(([url]) => String(url) === '/api/director/generate-storyboard')).toHaveLength(2)
})

it('다른 프로젝트로 이동했으면 이전 이미지 요청의 오류를 새 화면에 남기지 않는다', async () => {
  let reject!: (error: Error) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_resolve, fail) => { reject = fail })))
  const request = api().generateStoryboardImage(shotId)
  useDirectorCanvasStore.setState({ projectId: crypto.randomUUID() })
  api().updateNodeData<'shot'>(shotId, { storyboardImage: null })
  reject(new TypeError('fetch failed'))
  await request
  expect(api().generationErrors).toEqual({})
  expect(api().nodes.find((node) => node.id === shotId)?.data.storyboardImage).toBeNull()
})

it('직접 추가한 이미지 노드의 접수 응답을 잃으면 자동으로 다시 제출하지 않는다', async () => {
  api().updateNodeData<'shot'>(shotId, { writerShotId: undefined })
  const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
  vi.stubGlobal('fetch', fetch)
  await api().generateStoryboardImage(shotId)
  expect(fetch.mock.calls.filter(([url]) => String(url) === '/api/generate/image')).toHaveLength(1)
  expect(api().nodes.find((node) => node.id === shotId)?.data.storyboardImage).toMatchObject({ status: 'generating' })
})

function replayedBatchFetch() {
  const representative = 'https://media.test/first-shot.png'
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    if (url === '/api/director/generate-storyboard') {
      return Response.json({ jobId: 'batch-job', replayed: true })
    }
    if (url === '/api/generation-jobs/batch-job') {
      return Response.json({ data: { status: 'completed', resultUrl: representative } })
    }
    throw new Error(`Unexpected fetch: ${String(url)}`)
  }))
  useDirectorCanvasStore.setState({ hydrateFromDb: vi.fn().mockResolvedValue(undefined) })
  return representative
}

it('기존 일괄 이미지 작업을 기다리면 요청한 샷의 이미지만 반영하고 완료를 알린다', async () => {
  const representative = replayedBatchFetch()
  const ownImage = { url: 'https://media.test/second-shot.png', status: 'completed', generatedAt: 10, errorMessage: null,
    frames: { start: 'https://media.test/second-shot.png', direction: 'https://media.test/second-direction.png', end: 'https://media.test/second-end.png' } }
  shots.load.mockResolvedValue({ data: [
    { shot_id: 'other-shot', storyboard_image: { ...ownImage, url: representative } },
    { shot_id: 'shot-1', storyboard_image: ownImage },
  ], error: null })
  const onJob = vi.fn()

  const result = await api().generateStoryboardImage(shotId, { onJob })

  expect(result).toMatchObject({ status: 'completed', resultUrl: ownImage.url })
  expect(api().nodes.find((node) => node.id === shotId)?.data.storyboardImage).toEqual(ownImage)
  expect(onJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', resultUrl: ownImage.url }))
  expect(onJob.mock.calls.flat()).not.toContainEqual(expect.objectContaining({ resultUrl: representative }))
  expect(shots.invalidate).toHaveBeenCalledWith(api().projectId)
  expect(shots.load).toHaveBeenCalledWith(api().projectId)
  expect(shots.invalidate.mock.invocationCallOrder[0]).toBeLessThan(shots.load.mock.invocationCallOrder[0])
})

it('재사용한 이미지 작업의 샷 결과를 읽지 못하면 예전 이미지를 완료 결과로 알리지 않는다', async () => {
  const representative = replayedBatchFetch()
  const previous = { url: 'https://media.test/previous.png', status: 'completed' as const, generatedAt: 1, errorMessage: null }
  api().updateNodeData<'shot'>(shotId, { storyboardImage: previous })
  shots.load.mockResolvedValue({ data: null, error: { message: 'Shot read failed' } })
  const onJob = vi.fn()

  const result = await api().generateStoryboardImage(shotId, { onJob })

  expect(result).toMatchObject({ status: 'queued' })
  expect(api().nodes.find((node) => node.id === shotId)?.data.storyboardImage).toMatchObject({ url: previous.url, status: 'generating' })
  expect(onJob.mock.calls.flat()).not.toContainEqual(expect.objectContaining({ status: 'completed' }))
  expect(onJob.mock.calls.flat()).not.toContainEqual(expect.objectContaining({ resultUrl: representative }))
})

it('재사용한 이미지 작업의 샷이 아직 완료되지 않았으면 다른 샷의 이미지를 대신 쓰지 않는다', async () => {
  replayedBatchFetch()
  shots.load.mockResolvedValue({ data: [{ shot_id: 'shot-1', storyboard_image: { url: '', status: 'generating', generatedAt: 0, errorMessage: null } }], error: null })
  const onJob = vi.fn()
  const result = await api().generateStoryboardImage(shotId, { onJob })
  expect(result).toMatchObject({ status: 'queued' })
  expect(api().nodes.find((node) => node.id === shotId)?.data.storyboardImage).toMatchObject({ url: '', status: 'generating' })
  expect(onJob.mock.calls.flat()).not.toContainEqual(expect.objectContaining({ status: 'completed' }))
})

it('수동 이미지 생성 중 프로젝트를 바꾸면 이전 이미지의 업로드를 새 프로젝트에 요청하지 않는다', async () => {
  api().updateNodeData<'shot'>(shotId, { writerShotId: undefined })
  let complete!: (response: Response) => void
  const fetch = vi.fn(async (url: RequestInfo | URL) => {
    if (url === '/api/generate/image') return new Promise<Response>((done) => { complete = done })
    if (String(url).startsWith('blob:')) return new Response(new Blob(['image'], { type: 'image/png' }))
    if (url === '/api/assets/upload-image') return Response.json({ publicUrl: 'https://media.test/uploaded.png' })
    throw new Error(`Unexpected fetch: ${String(url)}`)
  })
  vi.stubGlobal('fetch', fetch)
  const request = api().generateStoryboardImage(shotId)
  useDirectorCanvasStore.setState({ projectId: crypto.randomUUID() })
  api().updateNodeData<'shot'>(shotId, { storyboardImage: null })
  complete(new Response(new Blob(['image'], { type: 'image/png' })))
  await request

  expect(fetch.mock.calls.filter(([url]) => url === '/api/assets/upload-image')).toHaveLength(0)
  expect(api().nodes.find((node) => node.id === shotId)?.data.storyboardImage).toBeNull()
})
