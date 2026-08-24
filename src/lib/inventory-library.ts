'use client'

import { useQuery } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query-client'
import type { InventoryItem, InventoryKind } from '@/types/inventory'

// ============================================================================
// Inventory — zustand store(inventory-store) → TanStack Query 전환 2호 (2026-08-24).
//
// 옛 store 의 두 소비처는 각자 useEffect 로 load 를 불러, 픽커는 열 때마다·그리드는
// 마운트마다 전체 목록을 다시 받았다. 여기서는 workspace 별 칸(inventoryKey)에
// 5분 신선 기간이 붙어 그 사이 재방문은 네트워크 없이 답한다.
//
// 옛 store 의 reset("workspace 전환 stale 금지")은 이식하지 않았다 — 칸 주소에
// workspaceId 가 들어가므로 다른 workspace 는 애초에 다른 칸이다. saveFromAsset 도
// 이식하지 않았다 — 소비처가 0 (API 라우트만 남은 휴면 경로, 되살릴 때 여기 붙인다).
//
// 서버 이름공간 주의: 서버 헬퍼는 `@/lib/inventory`(supabaseAdmin) — 이 파일은
// 브라우저 전용이라 이름을 갈랐다.
// ============================================================================

export const inventoryKey = (workspaceId: string) => ['inventory', workspaceId] as const

async function fetchInventory(workspaceId: string): Promise<InventoryItem[]> {
  const res = await fetch('/api/inventory?workspaceId=' + encodeURIComponent(workspaceId))
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Failed to load inventory')
  return body.items ?? []
}

/** workspace 의 인벤토리 목록. 사용자가 올리거나 지울 때만 바뀌므로 5분간 신선.
 *  픽커처럼 "열려 있을 때만" 받고 싶으면 workspaceId 에 null 을 넘겨 끈다. */
export function useInventory(workspaceId: string | null) {
  return useQuery({
    queryKey: inventoryKey(workspaceId ?? ''),
    queryFn: () => fetchInventory(workspaceId ?? ''),
    enabled: !!workspaceId,
    staleTime: 5 * 60_000,
  })
}

/** 업로드 성공 시 해당 workspace 칸 맨 앞에 붙인다(옛 store 의 [item, ...s.items] 동일).
 *  실패는 던지지 않고 error 문자열로 돌려준다 — 호출처(그리드)가 안내문으로 그린다. */
export async function uploadInventoryItem(
  workspaceId: string,
  kind: InventoryKind,
  name: string,
  file: File,
): Promise<{ item: InventoryItem | null; error: string | null }> {
  try {
    const formData = new FormData()
    formData.append('workspaceId', workspaceId)
    formData.append('kind', kind)
    formData.append('name', name)
    formData.append('file', file)
    // Content-Type 헤더 수동 설정 금지 — 브라우저가 multipart boundary 자동 설정
    const res = await fetch('/api/inventory/upload', { method: 'POST', body: formData })
    const body = await res.json()
    if (!res.ok) return { item: null, error: body.error ?? 'Failed to upload' }
    const item: InventoryItem = body.item
    getQueryClient().setQueryData<InventoryItem[]>(inventoryKey(workspaceId), (old) => [
      item,
      ...(old ?? []),
    ])
    return { item, error: null }
  } catch (err) {
    return { item: null, error: err instanceof Error ? err.message : 'Failed to upload' }
  }
}

/** 낙관적 삭제 — 칸을 백업하고 즉시 걷어낸 뒤, 서버가 거부하면 백업으로 되돌린다
 *  (옛 store 의 backup/rollback 동일). 옛 시그니처와 달리 workspaceId 를 받는다 —
 *  칸 주소에 필요하고, 유일한 호출처(그리드)가 이미 들고 있다. */
export async function removeInventoryItem(
  workspaceId: string,
  id: string,
): Promise<{ error: string | null }> {
  const client = getQueryClient()
  const key = inventoryKey(workspaceId)
  const backup = client.getQueryData<InventoryItem[]>(key)
  client.setQueryData<InventoryItem[]>(key, (old) => old?.filter((i) => i.id !== id))
  try {
    const res = await fetch('/api/inventory?id=' + encodeURIComponent(id), { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      client.setQueryData(key, backup)
      return { error: body.error ?? 'Failed to delete' }
    }
    return { error: null }
  } catch (err) {
    client.setQueryData(key, backup)
    return { error: err instanceof Error ? err.message : 'Failed to delete' }
  }
}
