// 타이틀 카드에 올리는 그림이 서버 크기 한도(4.5MB)를 넘어도 줄여서 올라가고, 너무 큰 그림은 알아듣는 말로 막는지 검사한다 (디자이너 실제 화면 확인 뒤 작은 고장, 2026-11-14)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { StateCreator } from 'zustand/vanilla'

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))
const mocks = vi.hoisted(() => ({ downscale: vi.fn(), toastError: vi.fn() }))
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
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/upload/downscale', async (original) => ({ ...await original<typeof import('@/lib/upload/downscale')>(), downscaleForUpload: mocks.downscale }))

import { TitleImagePicker } from '@/features/editor/title-image-picker'
import { ImageUploadConsentDialog } from '@/components/upload/image-upload-consent'
import { useProjectStore } from '@/stores/project-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { useWriterStore } from '@/stores/writer-store'
import { useLocaleStore } from '@/stores/locale-store'
import { translate } from '@/lib/i18n/translate'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}

const MB = 1024 * 1024
const onPick = vi.fn()
const onOpenChange = vi.fn()
const fetchMock = vi.fn()
function renderPicker() {
  hooks.cursor = 0
  return elements(TitleImagePicker({ open: true, onPick, onOpenChange }))
}
/** 내 컴퓨터에서 bytes 크기의 그림을 고른다. */
function chooseFile(bytes: number, name = 'poster.png') {
  const input = renderPicker().find((node) => node.type === 'input' && node.props.type === 'file')!
  const file = new File([new Uint8Array(bytes)], name, { type: name.endsWith('.gif') ? 'image/gif' : 'image/png' })
  ;(input.props.onChange as (event: unknown) => void)({ target: { files: [file], value: file.name } })
  return file
}
const consentDialog = () => renderPicker().find((node) => node.type === ImageUploadConsentDialog)
function agree() {
  const dialog = consentDialog()
  expect(dialog).toBeDefined()
  ;(dialog!.props as { onDecision: (accepted: boolean) => void }).onDecision(true)
}

beforeEach(() => {
  hooks.slots = []
  hooks.cursor = 0
  useProjectStore.setState({ projectId: 'title-image-project' })
  useAssetStorageStore.setState({ characters: {}, worlds: {} })
  useWriterStore.setState({ shots: [] })
  useLocaleStore.setState({ locale: 'ko' })
  onPick.mockReset()
  onOpenChange.mockReset()
  mocks.toastError.mockReset()
  mocks.downscale.mockReset().mockImplementation(async (file: File) => file)
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ url: 'https://media/title.jpg' }) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('타이틀 카드 그림 크기', () => {
  it('4.5MB 넘는 그림도 줄여서 올린다 — 투명한 곳이 있으면 투명을 지키고, 없으면 카드 바탕처럼 검은 바탕의 JPEG 로', async () => {
    // 왜: 서버(Vercel)는 4.5MB 넘는 요청을 함수가 돌기 전에 거절해, 휴대폰 사진 같은 큰 그림은 "HTTP 413"으로 실패했다.
    //   고장: 4.5~10MB 그림을 타이틀 카드에 올릴 때(2026-11-13 분석에서 발견).
    const small = new File([new Uint8Array(1024)], 'poster.jpg', { type: 'image/jpeg' })
    mocks.downscale.mockResolvedValue(small)
    const file = chooseFile(6 * MB)
    agree()
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith('https://media/title.jpg'))
    expect(mocks.downscale).toHaveBeenCalledWith(file, { background: 'black', keepTransparency: true })
    const sent = (fetchMock.mock.calls[0]![1] as { body: FormData }).body.get('file') as File
    expect(sent.name).toBe('poster.jpg')
    expect(sent.size).toBe(1024)
  })

  it('10MB 넘는 그림은 동의 창을 띄우기 전에 막고 "10MB 이하로 올려 주세요"라고 알린다', async () => {
    // 왜: 서버 규칙(그림 10MB까지)과 같게 — 예전에는 동의까지 받은 뒤 "HTTP 413"만 보였다.
    chooseFile(11 * MB, 'huge.png')
    await Promise.resolve()
    expect(consentDialog()).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(translate('ko', '"{name}" is larger than 10MB. Please upload one of 10MB or less.', { name: 'huge.png' }))
  })

  it('줄이지 못한 그림이 서버 크기 한도에 걸리면 "HTTP 413" 대신 그림이 너무 크다고 알린다', async () => {
    // 왜: 숫자만 보여서 무엇을 해야 할지 몰랐다. 고장: 브라우저가 열지 못해 줄이지 못한 큰 그림(예: 일부 HEIC).
    fetchMock.mockResolvedValue({ ok: false, status: 413, json: async () => { throw new Error('not json') } })
    chooseFile(5 * MB)
    agree()
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(mocks.toastError).toHaveBeenCalledWith(translate('ko', 'The picture is too large. Choose a smaller one.'))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('4MB 넘는 GIF 는 줄이지 않고 동의 창을 띄우기 전에 "GIF 그림은 4MB까지"라고 알린다', async () => {
    // 왜: 검토 c — 줄이면 JPEG 로 바뀌어 움직이는 GIF 의 움직임이 사라졌다. GIF 는 받은 그대로 올릴 수 있는 크기까지만 받는다.
    chooseFile(5 * MB, 'loop.gif')
    await Promise.resolve()
    expect(consentDialog()).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.downscale).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(translate('ko', 'GIF images can be up to 4MB.'))
  })
})

describe('줄일 때 고르는 형식', () => {
  it('투명한 곳이 있는 그림은 줄여도 투명을 지키는 PNG 로, 투명이 없으면 JPEG 로 줄인다', async () => {
    // 왜: 검토 c — 투명 로고가 검은 네모가 되어 '그림이 글자 위' 배치에서 글자를 가렸다. 사진처럼 투명이 없는 그림은 JPEG 가 가장 작다.
    const { hasTransparency, downscaleType } = await vi.importActual<typeof import('@/lib/upload/downscale')>('@/lib/upload/downscale')
    const opaque = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255])
    const seeThrough = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128])
    expect(hasTransparency(opaque)).toBe(false)
    expect(hasTransparency(seeThrough)).toBe(true)
    expect(downscaleType({ keepTransparency: true, transparent: true })).toBe('image/png')
    expect(downscaleType({ keepTransparency: true, transparent: false })).toBe('image/jpeg')
    // 다른 곳(브레이크다운 참고 그림)은 지금처럼 늘 JPEG.
    expect(downscaleType({ keepTransparency: false, transparent: true })).toBe('image/jpeg')
  })
})

