'use client'

// 좌표 ④ ui_reflected 보고 (#a2-observability 2026-08-26).
//
// "잡은 완료됐는데 화면은 옛 상태" — A2 부검에서 유무·빈도를 측정할 수단이 없던 구멍.
// 잡이 active 큐에서 빠지고(hydrate 재수화까지 끝난 뒤) 결과가 화면 상태에 반영된 순간을
// POST /api/writer/debug-events 로 잡별 1행 보고한다. generation_job_id 로 조인해
// "completed 인데 ui_reflected 없는 잡 = 렌더링/반영 문제"를 쿼리 하나로 분류하기 위함.
//
// 주의: 여기서의 "반영"은 스토어 재수화 완료(= 다음 페인트에 보임)까지다. <img> 로드 성공까지는
// 아니다 — 그 구분이 필요해지면 2차에서 onLoad 보고를 얹는다.
import type { ActiveJob } from '@/lib/generation-queue'

const reported = new Set<string>()

/** prev 에는 있었는데 next 에 없는 잡 — 이번 틱에 큐를 떠난(완료/실패 확정) 잡들. */
export function computeSettledJobs(
  prev: readonly ActiveJob[],
  next: readonly ActiveJob[],
): ActiveJob[] {
  if (prev.length === 0) return []
  const alive = new Set(next.map((j) => j.id))
  return prev.filter((j) => !alive.has(j.id))
}

/** 잡별 1행 fire-and-forget 보고. 세션 내 중복 보고는 잡 id 로 억제. 실패는 조용히 버린다. */
export function reportUiReflected(
  projectId: string,
  settled: readonly ActiveJob[],
  view: string,
): void {
  for (const job of settled) {
    if (reported.has(job.id)) continue
    reported.add(job.id)
    void fetch('/api/writer/debug-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        event: 'ui_reflected',
        generationJobId: job.id,
        payload: { view, kind: job.kind },
      }),
    }).catch(() => {
      // 관측 실패가 화면 갱신을 방해하면 안 된다. 누락되면 해당 잡은 "반영 미확인"으로 남을 뿐.
      reported.delete(job.id)
    })
  }
}
