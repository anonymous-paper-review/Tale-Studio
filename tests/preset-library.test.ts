import { QueryClient } from '@tanstack/react-query'
import { DEFAULT_CAMERA_PRESET } from '@/types/shot'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// vitest 환경은 node 라 isServer=true → 진짜 getQueryClient 는 호출마다 새 인스턴스를
// 준다(서버 격리 정책). 여기서는 캐시 조작 로직이 검증 대상이므로 한 인스턴스를 공유시킨다.
const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({
  getQueryClient: () => shared.client,
}))

import {
  deletePreset,
  findPresetInCache,
  presetsKey,
  savePreset,
  type CameraLightPreset,
} from '@/lib/director/preset-library'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function preset(id: string, name = id): CameraLightPreset {
  return {
    id,
    name,
    camera: {} as CameraLightPreset['camera'],
    lighting: {} as CameraLightPreset['lighting'],
    cameraPreset: DEFAULT_CAMERA_PRESET,
  }
}

const cellOf = (projectId: string) =>
  shared.client.getQueryData<CameraLightPreset[]>(presetsKey(projectId))

beforeEach(() => {
  shared.client = new QueryClient()
  fetchMock.mockReset()
})

describe('savePreset', () => {
  it('저장 성공 시 해당 프로젝트 칸 맨 앞에 붙인다 (옛 store 의 [preset, ...prev] 동일)', async () => {
    shared.client.setQueryData(presetsKey('proj-a'), [preset('old')])
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ preset: preset('new') }), { status: 200 }),
    )

    await savePreset({
      projectId: 'proj-a',
      name: 'new',
      camera: {} as CameraLightPreset['camera'],
      lighting: {} as CameraLightPreset['lighting'],
      cameraPreset: DEFAULT_CAMERA_PRESET,
    })

    expect(cellOf('proj-a')?.map((p) => p.id)).toEqual(['new', 'old'])
  })

  it('칸이 비어 있어도(첫 저장) 붙는다 — old ?? [] 폴백', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ preset: preset('first') }), { status: 200 }),
    )

    await savePreset({
      projectId: 'proj-empty',
      name: 'first',
      camera: {} as CameraLightPreset['camera'],
      lighting: {} as CameraLightPreset['lighting'],
      cameraPreset: DEFAULT_CAMERA_PRESET,
    })

    expect(cellOf('proj-empty')?.map((p) => p.id)).toEqual(['first'])
  })

  it('HTTP 실패는 던지지 않고 warn — 캐시는 건드리지 않는다 (옛 store 동작 보존)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    shared.client.setQueryData(presetsKey('proj-a'), [preset('old')])
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))

    await expect(
      savePreset({
        projectId: 'proj-a',
        name: 'x',
        camera: {} as CameraLightPreset['camera'],
        lighting: {} as CameraLightPreset['lighting'],
        cameraPreset: DEFAULT_CAMERA_PRESET,
      }),
    ).resolves.toBeUndefined()

    expect(cellOf('proj-a')?.map((p) => p.id)).toEqual(['old'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('deletePreset', () => {
  it('id 를 모든 프로젝트 칸에서 걷어낸다 — 호출처가 projectId 를 모르는 옛 시그니처 유지', async () => {
    shared.client.setQueryData(presetsKey('proj-a'), [preset('keep-a'), preset('victim')])
    shared.client.setQueryData(presetsKey('proj-b'), [preset('keep-b')])
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await deletePreset('victim')

    expect(cellOf('proj-a')?.map((p) => p.id)).toEqual(['keep-a'])
    expect(cellOf('proj-b')?.map((p) => p.id)).toEqual(['keep-b'])
  })

  it('HTTP 실패 시 캐시를 건드리지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    shared.client.setQueryData(presetsKey('proj-a'), [preset('victim')])
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))

    await deletePreset('victim')

    expect(cellOf('proj-a')?.map((p) => p.id)).toEqual(['victim'])
    warn.mockRestore()
  })
})

describe('findPresetInCache', () => {
  it('여러 프로젝트 칸을 가로질러 찾는다 — 드롭 핸들러의 옛 getState().presets.find 자리', () => {
    shared.client.setQueryData(presetsKey('proj-a'), [preset('a1')])
    shared.client.setQueryData(presetsKey('proj-b'), [preset('b1')])

    expect(findPresetInCache('b1')?.id).toBe('b1')
    expect(findPresetInCache('a1')?.id).toBe('a1')
    expect(findPresetInCache('ghost')).toBeUndefined()
  })
})
