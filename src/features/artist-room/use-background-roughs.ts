'use client'

// Artist 화면이 열려 있는 동안 Storyboard 러프를 미리 그린다(2026-10-20 오너 "시간 절약"). 규칙은 lib/artist/background-roughs.
//   ready 가 켜질 때, 그리고 nudge(그린 Artist 그림 장수)가 바뀔 때 한 번씩 돈다 — 자리가 차서 멈췄으면 Artist 그림이 하나 끝나
//   자리가 날 때 다시 돈다(타이머로 두드리지 않는다, 2026-09-11 "자리 부족은 자동 재시도 없음"과 같은 결). 다 그렸으면 다시 돌지 않는다.
//   화면을 떠나면 다음 묶음을 보내지 않는다 — 남은 컷은 Storyboard 화면이 이어 그린다.
import { useEffect, useRef, useState } from 'react'
import { drawRoughsInBackground } from '@/lib/artist/background-roughs'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import type { RoughPumpOutcome } from '@/lib/writer/rough-pump-client'

export function useBackgroundRoughs(projectId: string | null, ready: boolean, nudge: number): { drawing: boolean; outcome: RoughPumpOutcome | null } {
  const [state, setState] = useState<{ projectId: string | null; drawing: boolean; outcome: RoughPumpOutcome | null }>({ projectId: null, drawing: false, outcome: null })
  const runningRef = useRef(false)
  const abortRef = useRef(false)
  const doneRef = useRef<string | null>(null)

  useEffect(() => {
    abortRef.current = false
    return () => {
      abortRef.current = true
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || !ready || runningRef.current || doneRef.current === projectId) return
    runningRef.current = true
    setState({ projectId, drawing: true, outcome: null })
    void drawRoughsInBackground(projectId, {
      fetchImpl: (input, init) => fetch(input, init),
      poll: (jobId) => pollGenerationJob(jobId),
      isAborted: () => abortRef.current,
    })
      .then((outcome) => {
        if (outcome === 'done') doneRef.current = projectId
        setState({ projectId, drawing: false, outcome })
      })
      .catch(() => setState({ projectId, drawing: false, outcome: 'request_failed' }))
      .finally(() => {
        runningRef.current = false
      })
  }, [projectId, ready, nudge])

  return state.projectId === projectId ? { drawing: state.drawing, outcome: state.outcome } : { drawing: false, outcome: null }
}
