'use client'

// Artist 화면이 열려 있는 동안 Storyboard 러프를 미리 그린다(2026-10-20 오너 "시간 절약"). 규칙은 lib/artist/background-roughs.
//   ready 가 켜질 때, 그리고 nudge(그린 Artist 그림 장수)가 바뀔 때 한 번씩 돈다 — 자리가 차서 멈췄으면 Artist 그림이 하나 끝나
//   자리가 날 때 다시 돈다(타이머로 두드리지 않는다, 2026-09-11 "자리 부족은 자동 재시도 없음"과 같은 결). 다 그렸으면 다시 돌지 않는다.
//   화면을 떠나면 다음 묶음을 보내지 않는다 — 남은 컷은 Storyboard 화면이 이어 그린다.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createBackgroundRoughRuns, drawRoughsInBackground } from '@/lib/artist/background-roughs'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import type { RoughPumpOutcome } from '@/lib/writer/rough-pump-client'

export function useBackgroundRoughs(projectId: string | null, ready: boolean, nudge: number): { drawing: boolean; outcome: RoughPumpOutcome | null } {
  // 프로젝트마다 따로 — 다른 프로젝트로 옮기면 앞 프로젝트는 다음 묶음을 보내지 않고, 새 프로젝트는 바로 시작한다.
  const [runs] = useState(createBackgroundRoughRuns)
  useSyncExternalStore(runs.subscribe, runs.version, runs.version)

  useEffect(() => {
    runs.show(projectId)
    return () => runs.show(null)
  }, [projectId, runs])

  useEffect(() => {
    // 같은 프로젝트를 이미 그리는 중이면(다른 프로젝트에 다녀온 경우 포함) 그 실행이 이어 그린다.
    if (!projectId || !ready || !runs.begin(projectId)) return
    void drawRoughsInBackground(projectId, {
      fetchImpl: (input, init) => fetch(input, init),
      poll: (jobId) => pollGenerationJob(jobId),
      isAborted: () => runs.isAborted(projectId),
    })
      .catch((): RoughPumpOutcome => 'request_failed')
      .then((outcome) => runs.finish(projectId, outcome))
  }, [projectId, ready, nudge, runs])

  if (!projectId) return { drawing: false, outcome: null }
  return { drawing: runs.isRunning(projectId), outcome: runs.outcomeOf(projectId) }
}
