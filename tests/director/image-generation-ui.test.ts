// 이미지 생성 버튼은 접수부터 완료까지 진행 상태를 표시하고 기존 이미지는 확인 후 교체한다.
import { beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))
const queue = vi.hoisted(() => ({ jobs: [] as unknown[], status: 'ready', refresh: vi.fn() }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useDebugValue: () => {},
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: unknown) => { hooks.slots[slot] = value }]
  },
  useRef: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial }
    return hooks.slots[slot]
  },
  useEffect: () => {},
}))
vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla')
  const create = (initializer?: StateCreator<unknown>) => {
    if (!initializer) return create
    const store = createStore(initializer)
    return Object.assign((selector?: (state: unknown) => unknown) =>
      selector ? selector(store.getState()) : store.getState(), store)
  }
  return { create }
})
vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => queue.jobs,
  useGenerationQueueStatus: () => queue.status,
  refreshGenerationQueue: queue.refresh,
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))

import { ShotDetailPanel } from '@/features/director/canvas-panels/ShotDetailPanel'
import { ShotNodePopup } from '@/features/director/canvas-popups/ShotNodePopup'
import { RegenerateConfirmDialog } from '@/features/director/regenerate-confirm-dialog'
import { storyboardImageGenerationState } from '@/features/director/hooks/use-storyboard-image-generation'
import { Button } from '@/components/ui/button'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { type ShotNodeData } from '@/types/director'

type Element = ReactElement<Record<string, unknown>>
let shotId: string
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  if (typeof node.type === 'function' && node.type.name === 'StoryboardImageButton') {
    return elements((node.type as (props: Record<string, unknown>) => ReactNode)(node.props))
  }
  return [node, ...elements(node.props.children as ReactNode)]
}
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : ''
}
function render(component = ShotDetailPanel) {
  hooks.cursor = 0
  const data = director.getState().nodes.find(node => node.id === shotId)!.data as ShotNodeData
  return elements(component({ nodeId: shotId, data }))
}
function generateButton(nodes: Element[]) {
  const button = nodes.find(node => node.type === Button && /이미지|접수|생성 상태/.test(textOf(node)))
  expect(button).toBeDefined()
  return button!
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  queue.jobs = []
  queue.status = 'ready'
  queue.refresh.mockReset()
  director.setState({ projectId: 'image-ui-project', nodes: [], edges: [], realBatchBusy: false, generatingNodeIds: {} })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'shot-1' })
  useLocaleStore.setState({ locale: 'ko' })
})

it.each([['편집 패널', ShotDetailPanel], ['편집 팝업', ShotNodePopup]] as const)('이미지 작업을 접수하거나 생성 중이면 버튼을 잠그고 진행 상태를 보여준다 (%s)', (_label, component) => {
  const generate = vi.fn(() => {
    director.getState().updateNodeData<'shot'>(shotId, {
      storyboardImage: { url: '', status: 'generating', generatedAt: 0, errorMessage: null },
    })
    return Promise.resolve(null)
  })
  director.setState({ generateStoryboardImage: generate })
  const button = generateButton(render(component))
  expect(button.props.disabled).toBe(false)
  ;(button.props.onClick as () => void)()
  expect(generate).toHaveBeenCalledExactlyOnceWith(shotId)
  const submitting = generateButton(render(component))
  expect(submitting.props.disabled).toBe(true)
  expect(textOf(submitting)).toContain('접수 중')
  queue.jobs = [{ id: 'job-image', kind: 'shot_storyboard', target: { writerShotId: 'shot-1' } }]
  const generating = generateButton(render(component))
  expect(generating.props.disabled).toBe(true)
  expect(textOf(generating)).toContain('이미지 생성 중')
  expect(elements(generating).some(node => String(node.props.className).includes('animate-spin'))).toBe(true)
})

it('서버에 이미지 작업이 남아 있으면 다시 들어온 화면에서도 생성 버튼을 잠근다', () => {
  queue.jobs = [{ id: 'job-grid', kind: 'storyboard_real_grid', target: { writerShotIds: ['shot-1', 'shot-2'] } }]
  const button = generateButton(render())
  expect(button.props.disabled).toBe(true)
  expect(textOf(button)).toContain('이미지 생성 중')
})

it('기존 이미지를 다시 만들면 교체 확인 후 생성한다', () => {
  const generate = vi.fn().mockResolvedValue(null)
  director.setState({ generateStoryboardImage: generate })
  director.getState().updateNodeData<'shot'>(shotId, {
    storyboardImage: { url: 'https://example.com/image.png', status: 'completed', generatedAt: 1, errorMessage: null },
  })
  ;(generateButton(render()).props.onClick as () => void)()
  expect(generate).not.toHaveBeenCalled()
  const dialog = render().find(node => node.type === RegenerateConfirmDialog)!
  expect(dialog).toBeDefined()
  expect(dialog.props.open).toBe(true)
  expect(dialog.props.impact).toEqual(['기존 촬영용 이미지가 새 결과로 교체됩니다.'])
  ;(dialog.props.onConfirm as () => void)()
  expect(generate).toHaveBeenCalledExactlyOnceWith(shotId)
})

it('화면에 다시 들어와 생성 상태를 확인 중이면 확인이 끝날 때까지 생성 버튼을 잠근다', () => {
  queue.status = 'loading'
  const button = generateButton(render())
  expect(button.props.disabled).toBe(true)
  expect(textOf(button)).toContain('생성 상태 확인 중')
  queue.status = 'ready'
  expect(generateButton(render()).props.disabled).toBe(false)
})

it('생성 상태를 확인하지 못하면 이미지 요청 대신 상태 확인을 다시 시도한다', () => {
  queue.status = 'error'
  const generate = vi.fn()
  director.setState({ generateStoryboardImage: generate })
  const nodes = render()
  expect(generateButton(nodes).props.disabled).toBe(true)
  expect(nodes.some(node => textOf(node).includes('생성 상태를 확인하지 못했어요.'))).toBe(true)
  const retry = nodes.find(node => node.type === Button && textOf(node).includes('다시 시도'))!
  expect(retry).toBeDefined()
  ;(retry.props.onClick as () => void)()
  expect(queue.refresh).toHaveBeenCalledOnce()
  expect(generate).not.toHaveBeenCalled()
})

it('이미지 접수 여부가 불명확하면 상태 확인 중으로 표시하고 서버 작업이 보이면 생성 중으로 표시한다', () => {
  const image = { url: '', status: 'generating' as const, generatedAt: 0, errorMessage: '접수 여부를 확인하고 있어요.' }
  const uncertain = storyboardImageGenerationState({ image, queued: false, batchBusy: false, queueStatus: 'ready' })
  expect(uncertain.phase).toBe('uncertain')
  expect(uncertain.disabled).toBe(true)
  expect(uncertain.label).toBe('Checking image generation…')
  const queued = storyboardImageGenerationState({ image, queued: true, batchBusy: false, queueStatus: 'ready' })
  expect(queued.phase).toBe('generating')
  expect(queued.label).toBe('Generating image')
})

it('이미지 접수 여부가 불명확할 때 상태 다시 확인을 누르면 기존 상태만 조회하고 새 이미지를 요청하지 않는다', () => {
  const generate = vi.fn()
  const hydrate = vi.fn().mockResolvedValue(undefined)
  director.setState({ generateStoryboardImage: generate, hydrateFreshFromDb: hydrate })
  director.getState().updateNodeData<'shot'>(shotId, {
    storyboardImage: { url: '', status: 'generating', generatedAt: 0, errorMessage: '접수 여부를 확인하고 있어요.' },
  })
  const nodes = render()
  expect(generateButton(nodes).props.disabled).toBe(true)
  const check = nodes.find(node => node.type === Button && textOf(node) === '이미지 상태 다시 확인')!
  expect(check).toBeDefined()
  ;(check.props.onClick as () => void)()
  expect(hydrate).toHaveBeenCalledOnce()
  expect(queue.refresh).toHaveBeenCalledOnce()
  expect(generate).not.toHaveBeenCalled()
})

it('직접 추가한 이미지의 접수 여부가 불명확하면 다시 생성 안내를 확인한 뒤에만 새 요청을 보낸다', () => {
  const retry = vi.fn().mockResolvedValue(null)
  director.setState({ retryUnconfirmedManualStoryboardImage: retry })
  director.getState().updateNodeData<'shot'>(shotId, {
    writerShotId: undefined,
    storyboardImage: { url: '', status: 'generating', generatedAt: 0, errorMessage: '접수 여부를 확인할 수 없어요.' },
  })
  const nodes = render()
  expect(generateButton(nodes).props.disabled).toBe(true)
  expect(nodes.some(node => node.type === Button && textOf(node) === '이미지 상태 다시 확인')).toBe(false)
  const retryButton = nodes.find(node => node.type === Button && textOf(node) === '다시 생성')!
  expect(retryButton).toBeDefined()
  ;(retryButton.props.onClick as () => void)()
  expect(retry).not.toHaveBeenCalled()
  const dialog = render().find(node => node.type === RegenerateConfirmDialog && node.props.open)!
  expect(dialog).toBeDefined()
  expect(dialog.props.description).toBe('이전 요청이 아직 진행 중일 수 있어요. 다시 생성하면 새 요청을 보냅니다.')
  expect(dialog.props.busy).toBe(false)
  ;(dialog.props.onConfirm as () => void)()
  expect(retry).toHaveBeenCalledExactlyOnceWith(shotId)
})
