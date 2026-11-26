'use client'

// Storyboard 보드가 열려 있는 동안 빠진 콘티 그림을 이어 그린다(리드 2026-11-26 m1126) — 화면 쪽 효과 둘.
//   1) 들어올 때 · 화면이 열린 동안 새로 빠진 샷이 생길 때 이어 그리기를 시작한다(lib/storyboard/rough-fill roughFillStart).
//      이 화면에서 한 번 맡긴 샷은 저절로 다시 맡기지 않는다 — 자리 부족 · 반복 실패로 멈춘 샷은 화면에 다시 들어올 때 다시 맡긴다(예전 보드의 진입 1회와 같은 결).
//      화면을 떠나거나 프로젝트가 바뀌면 다음 묶음을 보내지 않는다.
//   2) 콘티 그림 작업이 큐에서 빠지면(이어 그리기 밖 — 콘티 화면 · 다른 탭에서 그린 것도) 샷을 다시 읽어 카드가 새 콘티 그림을 보인다(예전 보드와 같다).
//   약속: tests/writer/real-rough-fill.test.ts · tests/writer/real-board-view.test.ts
import { useEffect, useRef } from 'react'
import type { ActiveJob } from '@/lib/generation-queue'
import { computeSettledJobs, reportUiReflected } from '@/lib/generation-ui-reflected'
import type { AppLocale } from '@/lib/locale'
import { invalidateShots } from '@/lib/shots-cache'
import { ROUGH_IMAGE_JOB_KINDS } from '@/lib/storyboard/real-board'
import { fillMissingRoughs, missingContiShotIds, roughFillStart } from '@/lib/storyboard/rough-fill'
import { useRoughFillStore } from '@/lib/storyboard/rough-fill-store'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { useWriterStore } from '@/stores/writer-store'
import type { Shot } from '@/types'

export function useStoryboardRoughFill(input: {
  projectId: string | null
  /** 보드가 보이는 샷(보드 순서). */
  shots: ReadonlyArray<Pick<Shot, 'shotId' | 'roughStoryboard' | 'actionDescription'>>
  /** 지금 콘티 그림을 그리는 샷(lib/storyboard/real-board roughDrawingShotIds). */
  roughDrawing: ReadonlySet<string>
  activeJobs: readonly ActiveJob[]
  locale: AppLocale
}): void {
  const { projectId, locale } = input
  const loadProject = useWriterStore((s) => s.loadProject)
  const { status } = useWriterStatus(projectId)
  const writerRunning = !!(status?.started && !status.pipeline_completed && !status.pipeline_failed)
  const fillRunning = useRoughFillStore((s) => s.running)

  // 2) 콘티 그림 작업이 큐에서 빠지면 샷을 다시 읽는다. deps 는 작업 id 서명(원시값)만 — 배열은 ref 로 나른다.
  const roughJobs = input.activeJobs.filter((job) => ROUGH_IMAGE_JOB_KINDS.includes(job.kind))
  const roughSignature = roughJobs.map((job) => job.id).sort().join(',')
  const roughJobsRef = useRef<readonly ActiveJob[]>([])
  roughJobsRef.current = roughJobs
  const prevRoughJobsRef = useRef<readonly ActiveJob[]>([])
  useEffect(() => {
    const prev = prevRoughJobsRef.current
    const current = roughJobsRef.current
    prevRoughJobsRef.current = current
    if (!projectId) return
    const settled = computeSettledJobs(prev, current)
    if (settled.length === 0) return
    void invalidateShots(projectId)
    void loadProject()
      .then(() => reportUiReflected(projectId, settled, 'writer-rough'))
      .catch(() => {})
  }, [roughSignature, projectId, loadProject])

  // 화면이 이 프로젝트로 열려 있나 — 떠나거나 프로젝트가 바뀌면 도는 이어 그리기가 다음 묶음을 보내지 않는다.
  const liveRef = useRef<string | null>(null)
  useEffect(() => {
    liveRef.current = projectId
    return () => {
      liveRef.current = null
    }
  }, [projectId])

  // 1) 들어올 때 · 새로 빠진 샷이 생길 때 시작한다. 맡긴 샷은 이 화면(마운트) 동안 다시 맡기지 않는다.
  const missingKey = missingContiShotIds(input.shots, input.roughDrawing).join(',')
  const triedRef = useRef<{ projectId: string | null; ids: Set<string> }>({ projectId: null, ids: new Set() })
  useEffect(() => {
    if (!projectId) return
    if (triedRef.current.projectId !== projectId) triedRef.current = { projectId, ids: new Set() }
    const tried = triedRef.current.ids
    const start = roughFillStart({ missing: missingKey ? missingKey.split(',') : [], tried, running: fillRunning, writerRunning })
    if (start.length === 0) return
    for (const shotId of start) tried.add(shotId)
    void fillMissingRoughs(projectId, { locale, isAborted: () => liveRef.current !== projectId })
  }, [projectId, missingKey, fillRunning, writerRunning, locale])
}
