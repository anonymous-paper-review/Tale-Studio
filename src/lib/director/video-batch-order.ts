'use client'

// [먼저 하기](시안 D4 · 결정 페이지 추천, 리드 S4-2 7) — 도는 영상 묶음에서 아직 안 낸 샷 하나를 다음 차례로 옮겨 달라고 서버에 부탁하고
//   (PATCH /api/director/video-batches — 순서만, Take 예약 · 값 그대로), 돌아온 낼 순서를 화면에 바로 싣는다.
//   누르는 사이 그 샷이 나갔거나 묶음이 멈췄으면(409 · 404) 할 일이 없다 — 다음 조회가 화면을 맞춘다. 약속: tests/director/move-first.test.ts
import { useDirectorCanvasStore } from '@/stores/director-store'
import { videoBatchQueueOf } from '@/lib/director/video-batch-queue'
import type { VideoBatchSummary } from '@/lib/director/video-batch-types'

export type MoveFirstResult = 'moved' | 'gone' | 'failed'

export async function moveVideoBatchShotFirst(shotId: string): Promise<MoveFirstResult> {
  const store = useDirectorCanvasStore
  const { projectId, videoBatchRunId: batchId } = store.getState()
  if (!projectId || !batchId) return 'gone'
  try {
    const res = await fetch('/api/director/video-batches', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, batchId, shotId }),
    })
    if (res.status === 404 || res.status === 409) return 'gone'
    if (!res.ok) return 'failed'
    const { batch } = (await res.json()) as { batch?: VideoBatchSummary }
    // 그사이 다른 프로젝트 · 다른 묶음으로 바뀌었으면 옛 순서로 덮지 않는다.
    const now = store.getState()
    if (batch && now.projectId === projectId && now.videoBatchRunId === batchId) store.setState({ videoBatchQueue: videoBatchQueueOf(batch) })
    return 'moved'
  } catch {
    return 'failed'
  }
}
