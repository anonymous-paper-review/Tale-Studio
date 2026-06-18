// writer-pipeline 진행상황 폴링 훅
'use client'

import { useEffect, useState, useRef } from 'react'

export interface WriterStatus {
  projectId: string
  started: boolean
  pipeline_completed: boolean
  pipeline_failed: boolean
  progress_percent: number
  current_stage: string | null
  current_status: string | null
  last_timestamp: string | null
  error: string | null
  // 단계별 소요시간 (timing pipeline) — status 라우트가 state._timings 에서 계산.
  timings?: {
    pipeline_started_at: string | null
    total_ms: number | null
    stages?: Record<string, number>  // stage key → ms
  } | null
  // 단계별 타임라인 (실행 순서). 각 항목 = 한 stage 의 소요시간.
  timeline?: {
    stage: string
    ms: number
    seconds: number
    attempts: number
    ended_at: string
  }[]
  available: Record<string, boolean>
}

interface Options {
  intervalMs?: number      // 폴링 주기 (기본 3초)
  stopWhenCompleted?: boolean  // 완료 시 폴링 중단 (기본 true)
}

export function useWriterStatus(
  projectId: string | null | undefined,
  opts: Options = {},
): { status: WriterStatus | null; loading: boolean; error: string | null } {
  const interval = opts.intervalMs ?? 3000
  const stopWhenCompleted = opts.stopWhenCompleted ?? true

  const [status, setStatus] = useState<WriterStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // keepalive: 멈춘 체인을 ~60s 에 한 번만 재트리거 (스팸 방지)
  const lastKeepaliveRef = useRef(0)

  useEffect(() => {
    if (!projectId) return

    let cancelled = false

    // 멈춘 run 자가복구: started && 미완료/미실패인데 last_timestamp 가 ~90s 이상 오래되면
    //   /api/writer/step 을 POST 해 끊긴 서버리스 체인을 재개한다 (fire-and-forget, cron 비의존).
    // fan-out 단계(shotCheck/renderPrompts)는 샷 수에 비례해 100s+ 걸릴 수 있으므로
    //   stale 임계를 그보다 넉넉히 잡아 진행 중 단계를 "멈춤"으로 오판하지 않게 한다.
    //   (근본 해결은 fan-out 단계의 per-item 체크포인트 = Phase 2.)
    const STALE_MS = 180_000
    const KEEPALIVE_THROTTLE_MS = 60_000
    const maybeKeepalive = (s: WriterStatus) => {
      if (!s.started || s.pipeline_completed || s.pipeline_failed) return
      if (!s.last_timestamp) return
      const age = Date.now() - Date.parse(s.last_timestamp)
      if (Number.isNaN(age) || age < STALE_MS) return
      const now = Date.now()
      if (now - lastKeepaliveRef.current < KEEPALIVE_THROTTLE_MS) return
      lastKeepaliveRef.current = now
      fetch('/api/writer/step', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }).catch(() => {})
    }

    const tick = async () => {
      if (cancelled) return
      setLoading(true)
      let done = false
      try {
        const r = await fetch(`/api/writer/status/${projectId}`)
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          setError(j.error ?? `status ${r.status}`)
        } else {
          const j = (await r.json()) as WriterStatus
          setStatus(j)
          setError(null)
          done = !!(j.pipeline_completed || j.pipeline_failed)
          maybeKeepalive(j)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
      // 완료/실패면 더 폴링 안 함
      if (cancelled) return
      if (done && stopWhenCompleted) return
      timerRef.current = setTimeout(tick, interval)
    }

    tick()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [projectId, interval, stopWhenCompleted])

  return { status, loading, error }
}
