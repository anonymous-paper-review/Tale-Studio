// 타이틀 카드의 새 이미지 파일은 동의 후에만 업로드하고 기존 프로젝트 이미지 선택은 유지한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
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

import { TitleImagePicker } from '@/features/editor/title-image-picker'
import { ImageUploadConsentDialog } from '@/components/upload/image-upload-consent'
import { useProjectStore } from '@/stores/project-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { useWriterStore } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}

const onPick = vi.fn()
const onOpenChange = vi.fn()
const fetchMock = vi.fn()
function renderPicker() {
  hooks.cursor = 0
  return elements(TitleImagePicker({ open: true, onPick, onOpenChange }))
}

function chooseFile() {
  const input = renderPicker().find(node => node.type === 'input' && node.props.type === 'file')!
  const file = new File(['image'], 'portrait.png', { type: 'image/png' })
  ;(input.props.onChange as (event: unknown) => void)({ target: { files: [file], value: file.name } })
  return file
}

function consent() {
  const dialog = renderPicker().find(node => node.type === ImageUploadConsentDialog)
  expect(dialog).toBeDefined()
  return dialog!.props as { fileNames: string[]; onDecision: (accepted: boolean) => void }
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  useProjectStore.setState({ projectId: 'consent-editor-project' })
  useAssetStorageStore.setState({ characters: {}, worlds: {} })
  useWriterStore.setState({ shots: [] })
  useLocaleStore.setState({ locale: 'en' })
  onPick.mockReset()
  onOpenChange.mockReset()
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://media/uploaded.png' }) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('타이틀 카드 이미지 업로드 동의', () => {
  // 왜: 정상 경로 고정. 파일이 서버에 전송되기 전에 사용자가 동의해야 한다.
  it('내 컴퓨터의 이미지를 고르면 동의할 때까지 기다리고 동의하면 업로드하여 선택한다', async () => {
    const file = chooseFile()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
    expect(consent().fileNames).toEqual([file.name])
    consent().onDecision(true)
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith('https://media/uploaded.png'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/editor/title-image')
    expect(request.method).toBe('POST')
    expect(request.body.get('projectId')).toBe('consent-editor-project')
    expect(request.body.get('file').name).toBe(file.name)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  // 왜: 사용자가 취소한 파일을 보내거나 선택하면 안 된다.
  it('이미지 사용 동의를 취소하면 업로드하거나 타이틀 카드에 넣지 않는다', async () => {
    chooseFile()
    consent().onDecision(false)
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  // 왜: 이미 프로젝트 안에 있는 이미지를 고르는 동작은 새 파일 업로드가 아니다.
  it('기존 프로젝트 이미지를 고르면 업로드 동의 없이 타이틀 카드에 넣는다', () => {
    useWriterStore.setState({ shots: [{
      shotId: 'shot-existing', roughStoryboard: { status: 'completed', frames: { start: 'https://media/existing.png' } },
    } as ReturnType<typeof useWriterStore.getState>['shots'][number]] })
    const option = renderPicker().find(node => node.type === 'button' && node.props.title === 'shot-existing')!
    ;(option.props.onClick as () => void)()
    expect(onPick).toHaveBeenCalledWith('https://media/existing.png')
    expect(renderPicker().some(node => node.type === ImageUploadConsentDialog)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 왜: 동의 창이 열린 사이 프로젝트를 옮기면 이전 프로젝트에 파일을 올리면 안 된다.
  it('동의를 기다리는 동안 프로젝트가 바뀌면 동의해도 업로드하지 않는다', async () => {
    chooseFile()
    const dialog = consent()
    useProjectStore.setState({ projectId: 'another-project' })
    dialog.onDecision(true)
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})
