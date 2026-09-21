// 직접 추가한 이미지 노드는 접수 여부가 불명확할 때 확인 후에만 새 요청을 보내고 연타를 막는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { resetActionGuard } from '@/lib/action-guard'

const api = () => useDirectorCanvasStore.getState()
let shotId: string
beforeEach(() => {
  vi.useFakeTimers()
  resetActionGuard()
  api().reset()
  shotId = api().addShotNode(null, { x: 0, y: 0 }, '직접 추가한 이미지')
  api().updateNodeData<'shot'>(shotId, {
    promptOverride: 'A landscape',
    storyboardImage: { url: '', status: 'generating', errorMessage: '접수 여부를 확인할 수 없어요.', generatedAt: 0 },
  })
  useDirectorCanvasStore.setState({ projectId: crypto.randomUUID(), viewMode: 'node' })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('직접 추가한 이미지의 불명확한 요청을 다시 생성하기로 확인하면 연속으로 눌러도 새 요청은 한 번만 보낸다', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', fetch)
  void api().retryUnconfirmedManualStoryboardImage(shotId)
  void api().retryUnconfirmedManualStoryboardImage(shotId)
  await vi.advanceTimersByTimeAsync(1500)
  void api().retryUnconfirmedManualStoryboardImage(shotId)
  expect(fetch.mock.calls.filter(([url]) => String(url) === '/api/generate/image')).toHaveLength(1)
  expect(api().nodes.find(node => node.id === shotId)?.data.storyboardImage).toMatchObject({ status: 'generating', errorMessage: null })
})

it('Writer에 연결된 이미지이거나 접수 확인이 필요한 상태가 아니면 수동 이미지 다시 생성으로 요청하지 않는다', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', fetch)
  api().updateNodeData<'shot'>(shotId, { writerShotId: 'writer-shot' })
  await api().retryUnconfirmedManualStoryboardImage(shotId)
  api().updateNodeData<'shot'>(shotId, {
    writerShotId: undefined,
    storyboardImage: { url: '', status: 'generating', errorMessage: null, generatedAt: 0 },
  })
  await api().retryUnconfirmedManualStoryboardImage(shotId)
  expect(fetch).not.toHaveBeenCalled()
})
