'use client'

// [모두 멈추기]가 누를 때 지금 도는 작업 목록을 한 번 새로 읽는다(리드 2026-11-14 검토 a 낮음) — 저장해 둔 목록(쉴 때는 15초마다 읽음)만
//   쓰면 그사이 다른 탭 · 기기가 낸 낱개 작업은 멈추지 않았다. 못 읽으면 저장해 둔 목록으로 멈출 수 있는 것은 멈춘다.
//   약속: tests/director/stop-all.test.ts
import { activeJobsSnapshot, type ActiveJob } from '@/lib/generation-queue'

export async function freshActiveJobs(projectId: string): Promise<readonly ActiveJob[]> {
  try {
    const res = await fetch(`/api/generation/active?projectId=${encodeURIComponent(projectId)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { data?: { jobs?: ActiveJob[] } }
    return body.data?.jobs ?? []
  } catch {
    return activeJobsSnapshot(projectId)
  }
}
