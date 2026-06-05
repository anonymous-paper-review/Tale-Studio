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

  useEffect(() => {
    if (!projectId) return

    let cancelled = false

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
