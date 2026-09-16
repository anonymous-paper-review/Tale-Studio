// 채팅의 이미지 파일 선택과 드롭은 동의 전에는 첨부하거나 업로드하지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useDebugValue: () => {},
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: unknown) => {
      hooks.slots[slot] = typeof value === 'function' ? value(hooks.slots[slot]) : value
    }]
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
vi.mock('next/navigation', () => ({
  usePathname: () => '/studio/producer',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/lib/writer/use-writer-status', () => ({ useWriterStatus: () => ({ status: null }) }))
vi.mock('@/lib/chat-persistence', () => ({ saveChatMessage: vi.fn() }))

import { GlobalChat } from '@/components/layout/global-chat'
import { ImageUploadConsentDialog } from '@/components/upload/image-upload-consent'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}

function renderChat() {
  hooks.cursor = 0
  return elements(GlobalChat())
}

function selectFiles(route: '파일 선택' | '드롭', files: File[]) {
  const nodes = renderChat()
  if (route === '파일 선택') {
    const input = nodes.find(node => node.type === 'input' && node.props.type === 'file')!
    return (input.props.onChange as (event: { target: { files: File[] } }) => Promise<void>)({ target: { files } })
  }
  const drop = nodes.find(node => 'data-file-drop-zone' in node.props)!
  return (drop.props.onDrop as (event: unknown) => Promise<void>)({
    preventDefault: vi.fn(), dataTransfer: { types: ['Files'], files },
  })
}

function consent() {
  const dialog = renderChat().find(node => node.type === ImageUploadConsentDialog)
  expect(dialog).toBeDefined()
  return dialog!.props as { fileNames: string[]; onDecision: (accepted: boolean) => void }
}

function imageFile() { return new File(['image'], 'portrait.png', { type: 'image/png' }) }
const fetchMock = vi.fn()

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  useGlobalChatStore.getState().reset()
  useProjectStore.setState({ projectId: 'consent-chat-project', currentStage: 'producer' })
  useLocaleStore.setState({ locale: 'en' })
  fetchMock.mockReset().mockResolvedValue({
    ok: true, json: async () => ({ kind: 'image', originalUrl: 'https://media/image.png', slices: [] }),
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => { vi.unstubAllGlobals() })

describe('채팅 이미지 업로드 동의', () => {
  // 왜: 정상 경로 고정. 파일 선택과 드롭 모두 사용자의 결정을 기다려야 한다.
  it.each(['파일 선택', '드롭'] as const)('%s으로 이미지를 고르면 동의할 때까지 첨부하지 않고 동의하면 업로드한다', async (route) => {
    const file = imageFile()
    const uploading = selectFiles(route, [file])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(renderChat().some(node => node.type === 'span' && node.props.title === file.name)).toBe(false)
    const dialog = consent()
    expect(dialog.fileNames).toEqual([file.name])
    dialog.onDecision(true)
    await uploading
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/produce/ingest')
    expect(request.method).toBe('POST')
    expect(request.body.get('projectId')).toBe('consent-chat-project')
    expect(request.body.get('file').name).toBe(file.name)
  })

  // 왜: 혼합 선택에서 취소한 뒤 일부 파일만 전송되면 사용자가 예상하지 못한다.
  it('이미지와 문서를 함께 고르고 동의를 취소하면 어떤 파일도 첨부하거나 업로드하지 않는다', async () => {
    const image = imageFile()
    const document = new File(['story'], 'story.txt', { type: 'text/plain' })
    const uploading = selectFiles('파일 선택', [image, document])
    expect(consent().fileNames).toEqual([image.name])
    consent().onDecision(false)
    await uploading
    expect(fetchMock).not.toHaveBeenCalled()
    expect(renderChat().some(node => node.type === 'span' && [image.name, document.name].includes(node.props.title as string))).toBe(false)
  })

  // 왜: 이미지 권리 확인이 필요한 변경으로 원고 업로드를 막지 않는다.
  it('문서만 고르면 이미지 동의를 묻지 않고 기존대로 업로드한다', async () => {
    await selectFiles('파일 선택', [new File(['story'], 'story.txt', { type: 'text/plain' })])
    expect(renderChat().some(node => node.type === ImageUploadConsentDialog)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // 왜: 업로드할 수 없는 형식에 대한 동의를 받아도 업로드할 수는 없다.
  it('지원하지 않는 이미지 형식을 고르면 동의를 묻거나 업로드하지 않는다', async () => {
    await selectFiles('파일 선택', [new File(['svg'], 'portrait.svg', { type: 'image/svg+xml' })])
    expect(renderChat().some(node => node.type === ImageUploadConsentDialog)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 왜: 동의 창이 열린 사이 프로젝트를 옮기면 이전 프로젝트에 파일을 올리면 안 된다.
  it('동의를 기다리는 동안 프로젝트가 바뀌면 동의해도 업로드하지 않는다', async () => {
    const uploading = selectFiles('파일 선택', [imageFile()])
    const dialog = consent()
    useProjectStore.setState({ projectId: 'another-project' })
    dialog.onDecision(true)
    await uploading
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
