import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InventoryItem } from '@/types/inventory'

// preset-library.test 와 같은 이유(vitest 는 node 라 isServer=true)로 인스턴스를 공유시킨다.
const shared = vi.hoisted(() => ({ client: null as unknown as QueryClient }))
vi.mock('@/lib/query-client', () => ({
  getQueryClient: () => shared.client,
}))

import {
  inventoryKey,
  removeInventoryItem,
  uploadInventoryItem,
} from '@/lib/inventory-library'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function item(id: string): InventoryItem {
  return { id, kind: 'image', name: id, imageUrl: `https://x/${id}.png` } as InventoryItem
}

const cellOf = (ws: string) => shared.client.getQueryData<InventoryItem[]>(inventoryKey(ws))

beforeEach(() => {
  shared.client = new QueryClient()
  fetchMock.mockReset()
})

describe('uploadInventoryItem', () => {
  it('성공 시 해당 workspace 칸 맨 앞에 붙이고 item 을 돌려준다', async () => {
    shared.client.setQueryData(inventoryKey('ws-a'), [item('old')])
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ item: item('new') }), { status: 200 }),
    )

    const result = await uploadInventoryItem('ws-a', 'image', 'new', new File([], 'new.png'))

    expect(result.error).toBeNull()
    expect(result.item?.id).toBe('new')
    expect(cellOf('ws-a')?.map((i) => i.id)).toEqual(['new', 'old'])
  })

  it('HTTP 실패 시 캐시를 건드리지 않고 서버 오류 문구를 돌려준다', async () => {
    shared.client.setQueryData(inventoryKey('ws-a'), [item('old')])
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'too big' }), { status: 413 }),
    )

    const result = await uploadInventoryItem('ws-a', 'image', 'x', new File([], 'x.png'))

    expect(result).toEqual({ item: null, error: 'too big' })
    expect(cellOf('ws-a')?.map((i) => i.id)).toEqual(['old'])
  })

  it('다른 workspace 칸에는 붙지 않는다 — 칸 주소에 workspaceId 가 들어간다', async () => {
    shared.client.setQueryData(inventoryKey('ws-b'), [item('b1')])
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ item: item('a1') }), { status: 200 }),
    )

    await uploadInventoryItem('ws-a', 'image', 'a1', new File([], 'a1.png'))

    expect(cellOf('ws-a')?.map((i) => i.id)).toEqual(['a1'])
    expect(cellOf('ws-b')?.map((i) => i.id)).toEqual(['b1'])
  })
})

describe('removeInventoryItem — 낙관적 삭제', () => {
  it('성공: 요청이 나가기 전에 이미 걷어냈고, 성공 후에도 그대로다', async () => {
    shared.client.setQueryData(inventoryKey('ws-a'), [item('keep'), item('victim')])
    let cellDuringRequest: string[] | undefined
    fetchMock.mockImplementation(async () => {
      cellDuringRequest = cellOf('ws-a')?.map((i) => i.id)
      return new Response('{}', { status: 200 })
    })

    const result = await removeInventoryItem('ws-a', 'victim')

    expect(cellDuringRequest).toEqual(['keep']) // 서버 응답 전에 이미 화면에서 사라짐
    expect(result.error).toBeNull()
    expect(cellOf('ws-a')?.map((i) => i.id)).toEqual(['keep'])
  })

  it('서버 거부: 백업으로 되돌리고 오류 문구를 돌려준다', async () => {
    shared.client.setQueryData(inventoryKey('ws-a'), [item('keep'), item('victim')])
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'referenced by a shot' }), { status: 409 }),
    )

    const result = await removeInventoryItem('ws-a', 'victim')

    expect(result.error).toBe('referenced by a shot')
    expect(cellOf('ws-a')?.map((i) => i.id)).toEqual(['keep', 'victim'])
  })

  it('네트워크 예외: 마찬가지로 되돌린다', async () => {
    shared.client.setQueryData(inventoryKey('ws-a'), [item('victim')])
    fetchMock.mockRejectedValue(new Error('offline'))

    const result = await removeInventoryItem('ws-a', 'victim')

    expect(result.error).toBe('offline')
    expect(cellOf('ws-a')?.map((i) => i.id)).toEqual(['victim'])
  })
})
