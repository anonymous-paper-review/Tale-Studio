// Artist 에서 만드는 동안 Storyboard 를 미리 준비한다(2026-10-20 오너 "artist 만들면서 writer 파이프라인 및 storyboard도 같이 — 시간 절약").
//   씬 · 샷 나누기(Writer 08~15)는 [만들기]가 디자인 뒤에도 멈추지 않고 이어 간다(서버). 러프 스토리보드는
//   샷이 저장되고 Artist 그림을 다 그린 뒤, Artist 화면이 열려 있는 동안 빠진 컷을 미리 그린다(Storyboard 화면과 같은 펌프 규칙).
//   러프는 인물 · 배경 그림을 기준으로 쓰지 않는다(컷 배치 틀만) — Artist 그림과 상관없이 그릴 수 있다.
//   약속: tests/artist/rough-in-background.test.ts
import { runRoughPump, type RoughPumpOutcome } from '@/lib/writer/rough-pump-client'

type RunStatusLike = {
  started?: boolean
  pipeline_completed?: boolean
  pipeline_failed?: boolean
  current_status?: string | null
  current_stage?: string | null
} | null | undefined

/** 러프를 미리 그려도 되나 — 샷이 다 저장됐고(실행 끝남), Artist 그림을 그리는 중이 아니고, 공유 보기가 아니다.
 *  Artist 그림을 그리는 동안 러프가 돌면 Artist 그림은 한 장씩 그린다(10/9 규칙) — 지금 기다리는 그림이 느려지지 않게 뒤로 미룬다. */
export function backgroundRoughReady(input: { status: RunStatusLike; making: boolean; demo: boolean; artistCompleted: boolean }): boolean {
  // [완료하기] 뒤(예전에 끝까지 만든 프로젝트 포함)에는 Storyboard 화면이 그린다 — Artist 에서 표시 없이 그리지 않는다.
  if (input.demo || input.making || input.artistCompleted) return false
  return !!input.status?.started && input.status.pipeline_completed === true
}

export interface BackgroundRoughDeps {
  fetchImpl: typeof fetch
  /** 잡 하나가 끝날 때까지 기다린다(성공 · 실패 모두) — 묶음 사이의 배리어. */
  poll: (jobId: string) => Promise<unknown>
  isAborted: () => boolean
}

/** 빠진 러프를 묶음으로 차례로 맡긴다 — 어느 컷이 빠졌는지는 서버가 고른다. 자리가 차면(429) 알림 없이 멈춘다
 *  (남은 컷은 Storyboard 화면이 들어올 때 이어 그린다). */
export function drawRoughsInBackground(projectId: string, deps: BackgroundRoughDeps): Promise<RoughPumpOutcome> {
  return runRoughPump({
    isAborted: deps.isAborted,
    generate: async () => {
      let res: Response
      try {
        res = await deps.fetchImpl('/api/writer/rough-storyboard', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId }),
        })
      } catch {
        return null
      }
      if (res.status === 429) return { submitted: 0, remaining: 0, quota: true, done: Promise.resolve() }
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean
        data?: { submitted?: Array<{ shotId: string; jobId: string; confirmationPending?: boolean }>; remaining?: number; confirmationPending?: boolean }
      } | null
      if (!res.ok || !body?.data) return null
      const submitted = body.data.submitted ?? []
      const jobIds = [...new Set(submitted.map((item) => item.jobId).filter(Boolean))]
      return {
        submitted: submitted.length,
        remaining: body.data.remaining ?? 0,
        quota: false,
        confirmationPending: body.data.confirmationPending === true || submitted.some((item) => item.confirmationPending === true),
        done: Promise.allSettled(jobIds.map((jobId) => deps.poll(jobId))),
      }
    },
  })
}

/** 미리 그리기 장부 — 프로젝트마다 따로 돈다. 화면이 보고 있는 프로젝트가 아니면 다음 묶음을 보내지 않고,
 *  새 프로젝트는 앞 프로젝트가 끝나기를 기다리지 않는다(검토 지적). 같은 프로젝트를 두 번 맡기지 않고, 다 그린 프로젝트는 다시 돌지 않는다.
 *  화면은 subscribe · version 으로 바뀔 때마다 다시 그린다. */
export function createBackgroundRoughRuns() {
  let active: string | null = null
  let version = 0
  const running = new Set<string>()
  const done = new Set<string>()
  const outcomes = new Map<string, RoughPumpOutcome>()
  const listeners = new Set<() => void>()
  const changed = () => {
    version += 1
    for (const listener of listeners) listener()
  }
  return {
    /** 화면이 보고 있는 프로젝트(떠나면 null). */
    show(projectId: string | null) {
      active = projectId
    },
    /** 맡겨도 되면 true — 같은 프로젝트를 이미 그리는 중이거나 다 그렸으면 false. */
    begin(projectId: string): boolean {
      if (running.has(projectId) || done.has(projectId)) return false
      running.add(projectId)
      outcomes.delete(projectId)
      changed()
      return true
    },
    isRunning(projectId: string): boolean {
      return running.has(projectId)
    },
    isAborted(projectId: string): boolean {
      return active !== projectId
    },
    outcomeOf(projectId: string): RoughPumpOutcome | null {
      return outcomes.get(projectId) ?? null
    },
    finish(projectId: string, outcome: RoughPumpOutcome) {
      running.delete(projectId)
      outcomes.set(projectId, outcome)
      if (outcome === 'done') done.add(projectId)
      changed()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    version(): number {
      return version
    },
  }
}

export type StoryboardPrep = 'splitting' | 'drawing' | 'ready' | null

/** Artist 머리에 보이는 Storyboard 준비 상태 — [만들기] 뒤 · [완료하기] 전에만. */
export function storyboardPrepView(input: {
  status: RunStatusLike
  drawing: boolean
  outcome: RoughPumpOutcome | null
  artistCompleted: boolean
}): StoryboardPrep {
  const status = input.status
  if (input.artistCompleted || !status?.started) return null
  if (status.current_status === 'awaiting_confirmation' || status.current_status === 'awaiting_artist') return null
  if (!status.pipeline_completed) return status.pipeline_failed ? null : 'splitting'
  if (input.drawing) return 'drawing'
  return input.outcome === 'done' ? 'ready' : null
}
