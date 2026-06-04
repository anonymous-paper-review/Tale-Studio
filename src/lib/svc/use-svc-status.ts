// svc-pipeline 진행상황 폴링 훅
'use client'

import { useEffect, useState, useRef } from 'react'

export interface SvcStatus {
  projectId: string
  started: boolean
  pipeline_completed: boolean
  pipeline_failed: boolean
  progress_percent: number
  current_stage: string | null
  current_status: string | null
  last_timestamp: string | null
  error: string | null
  available: Record<string, boolean>
}

interface Options {
  intervalMs?: number      // 폴링 주기 (기본 3초)
  stopWhenCompleted?: boolean  // 완료 시 폴링 중단 (기본 true)
}

export function useSvcStatus(
  projectId: string | null | undefined,
  opts: Options = {},
): { status: SvcStatus | null; loading: boolean; error: string | null } {
  const interval = opts.intervalMs ?? 3000
  const stopWhenCompleted = opts.stopWhenCompleted ?? true

  const [status, setStatus] = useState<SvcStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!projectId) return

    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      setLoading(true)
      try {
        const r = await fetch(`/api/svc/status/${projectId}`)
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          setError(j.error ?? `status ${r.status}`)
        } else {
          const j = (await r.json()) as SvcStatus
          setStatus(j)
          setError(null)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
      // 완료/실패면 더 폴링 안 함
      const s = await fetch(`/api/svc/status/${projectId}`)
        .then((r) => r.json())
        .catch(() => null)
      const done = s && (s.pipeline_completed || s.pipeline_failed)
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
