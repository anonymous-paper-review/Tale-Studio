// Director의 참고 이미지 입력은 사용 동의를 받은 뒤에만 파일을 읽고 이미지 목록에 추가한다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { AssetNodeData, ShotNodeData } from '@/types/director'

const mocks = vi.hoisted(() => ({
  requestConsent: vi.fn(),
  updateNodeData: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useMemo: (factory: () => unknown) => factory(),
}))
vi.mock('@/lib/i18n', () => ({ useT: () => (text: string) => text }))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
vi.mock('@/components/upload/image-upload-consent', () => ({
  useImageUploadConsent: () => ({
    requestImageUploadConsent: mocks.requestConsent,
    imageUploadConsentDialog: null,
  }),
}))
vi.mock('@/stores/director-store', () => {
  const state = {
    projectId: 'consent-project',
    nodes: [],
    generationErrors: {},
    updateNodeData: mocks.updateNodeData,
    closePopup: vi.fn(),
    openDeleteConfirm: vi.fn(),
    generateAssetImage: vi.fn(),
  }
  return {
    useDirectorCanvasStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
      getState: () => state,
    }),
    effectivePrompt: (data: ShotNodeData) => data.prompt,
  }
})
vi.mock('@/stores/asset-storage-store', () => ({
  useAssetStorageStore: (selector: (value: { characters: Record<string, never>; worlds: Record<string, never> }) => unknown) =>
    selector({ characters: {}, worlds: {} }),
}))

import { AssetDetailPanel } from '@/features/director/canvas-panels/AssetDetailPanel'
import { ShotDetailPanel } from '@/features/director/canvas-panels/ShotDetailPanel'
import { ShotNodePopup } from '@/features/director/canvas-popups/ShotNodePopup'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}

const shot = {
  kind: 'shot',
  label: 'Shot',
  prompt: '',
  characterAssetIds: [],
  worldAssetIds: [],
  referenceImages: [],
} as unknown as ShotNodeData
const asset: AssetNodeData = {
  kind: 'asset',
  label: 'Character',
  assetKind: 'character',
  assetId: 'character-1',
  sourceImageUrl: null,
  imageUrl: null,
  prompt: '',
  referenceImages: [],
  generationStatus: 'pending',
  generationError: null,
  locked: false,
}
const surfaces = [
  ['이미지 편집 패널', () => AssetDetailPanel({ nodeId: 'node-1', data: asset })],
  ['샷 편집 패널', () => ShotDetailPanel({ nodeId: 'node-1', data: shot })],
  ['샷 편집 팝업', () => ShotNodePopup({ nodeId: 'node-1', data: shot })],
] as const

function selectFile(render: () => ReactNode, file: File) {
  const input = elements(render()).find(node => node.type === 'input' && node.props.type === 'file')
  expect(input).toBeDefined()
  const target = { files: [file], value: 'reference.png' }
  ;(input!.props.onChange as (event: { target: typeof target }) => void)({ target })
  expect(target.value).toBe('')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('FileReader', class {
    result: string | null = null
    onload: (() => void) | null = null
    readAsDataURL(file: File) {
      mocks.readFile(file)
      this.result = 'data:image/png;base64,consented-image'
      this.onload?.()
    }
  })
})

afterEach(() => { vi.unstubAllGlobals() })

// 왜: 세 입력 화면 중 하나라도 먼저 읽거나 저장하면 확인창을 우회할 수 있다.
it.each(surfaces)('이미지를 선택해 동의를 기다리면 파일을 읽거나 참고 이미지를 추가하지 않는다 (%s)', async (_name, render) => {
  mocks.requestConsent.mockReturnValue(new Promise<boolean>(() => {}))
  const file = new File(['image'], 'reference.png', { type: 'image/png' })
  selectFile(render, file)
  await Promise.resolve()
  expect(mocks.requestConsent).toHaveBeenCalledExactlyOnceWith([file])
  expect(mocks.readFile).not.toHaveBeenCalled()
  expect(mocks.updateNodeData).not.toHaveBeenCalled()
})

// 왜: 사용자가 취소하거나 확인창을 닫으면 선택한 이미지가 프로젝트에 남으면 안 된다.
it.each(surfaces)('이미지 사용 동의를 취소하면 파일을 읽거나 참고 이미지를 추가하지 않는다 (%s)', async (_name, render) => {
  mocks.requestConsent.mockResolvedValue(false)
  const file = new File(['image'], 'reference.png', { type: 'image/png' })
  selectFile(render, file)
  await Promise.resolve()
  expect(mocks.requestConsent).toHaveBeenCalledExactlyOnceWith([file])
  expect(mocks.readFile).not.toHaveBeenCalled()
  expect(mocks.updateNodeData).not.toHaveBeenCalled()
})

// 왜: 정상 경로 고정 — 명시적으로 동의한 이미지만 참고 목록에 들어간다.
it.each(surfaces)('이미지 사용에 동의하면 선택한 파일만 읽어 참고 이미지로 추가한다 (%s)', async (_name, render) => {
  let resolveConsent!: (accepted: boolean) => void
  mocks.requestConsent.mockReturnValue(new Promise<boolean>((resolve) => { resolveConsent = resolve }))
  const file = new File(['image'], 'reference.png', { type: 'image/png' })
  selectFile(render, file)
  expect(mocks.readFile).not.toHaveBeenCalled()
  resolveConsent(true)
  await Promise.resolve()
  expect(mocks.readFile).toHaveBeenCalledExactlyOnceWith(file)
  expect(mocks.updateNodeData).toHaveBeenCalledExactlyOnceWith('node-1', {
    referenceImages: [expect.objectContaining({ url: 'data:image/png;base64,consented-image' })],
  })
})
