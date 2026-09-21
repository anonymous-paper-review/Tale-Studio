// 사용자가 그만두면 선행 그림을 기다리던 일괄의 남은 영상을 내지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  wait: vi.fn(),
  resumed: vi.fn(),
}))
vi.mock('@/lib/generation-prerequisite-toast', () => ({
  isPrerequisiteMissing: (status: number, body: { code?: string }) =>
    status === 409 && body.code === 'missing_storyboard',
  waitForPrerequisite: mocks.wait,
  notifyPrerequisiteWaiting: vi.fn(),
  notifyPrerequisiteResumed: mocks.resumed,
  notifyPrerequisiteTimeout: vi.fn(),
}))

import { useDirectorCanvasStore as store } from '@/stores/director-store'

const generateVideoForShot = store.getState().generateVideoForShot
let ready!: () => void

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  store.getState().reset()
  store.setState({
    projectId: 'batch-cancel-project',
    generateVideoForShot,
    videoBatchBusy: false,
    videoBatchCancelled: false,
  })
  mocks.wait.mockImplementation(() => new Promise<'ready'>((resolve) => {
    ready = () => resolve('ready')
  }))
  vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === 'DELETE') return Response.json({ batch: { status: 'cancelled' } })
    return new Response(JSON.stringify({
      code: 'missing_storyboard',
      error: 'Storyboard is missing',
    }), { status: 409, headers: { 'content-type': 'application/json' } })
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  store.setState({ generateVideoForShot })
  vi.unstubAllGlobals()
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function waitForStoryboard() {
  const sceneId = store.getState().addSceneNode({ x: 0, y: 0 }, 'Scene')
  const shotId = store.getState().addShotNode(sceneId, { x: 360, y: 0 }, 'Shot')
  store.getState().beginVideoBatch(1)
  await store.getState().generateVideoForShot(shotId, { batch: true })
  expect(mocks.wait).toHaveBeenCalledTimes(1)
}

describe('사용자가 그만두면 남은 것을 내지 않는다.', () => {
  // #batch-resume: 이미지는 아직 없어서 영상 제출이 거절됐고, 사용자가 그 사이 중단했다.
  it.each([false, true])(
    '사용자가 그만두면 남은 것을 내지 않는다. (새 일괄 시작: %s)',
    async (startAnotherBatch) => {
      await waitForStoryboard()
      await store.getState().cancelVideoBatch()
      if (startAnotherBatch) store.getState().beginVideoBatch(1)
      const submit = vi.spyOn(store.getState(), 'generateVideoForShot').mockResolvedValue(null)

      ready()
      await Promise.resolve()

      expect(submit).not.toHaveBeenCalled()
      expect(mocks.resumed).not.toHaveBeenCalled()
    },
  )

  it('중단하지 않았으면 기다리던 그림이 준비될 때 영상 만들기를 다시 시작한다', async () => {
    await waitForStoryboard()
    const submit = vi.spyOn(store.getState(), 'generateVideoForShot').mockResolvedValue(null)

    ready()
    await Promise.resolve()

    expect(submit).toHaveBeenCalledTimes(1)
    expect(mocks.resumed).toHaveBeenCalledTimes(1)
  })
})
