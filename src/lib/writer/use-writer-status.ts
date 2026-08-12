// writer-pipeline 진행상황 폴링 훅
'use client'

import { useEffect, useState, useRef } from 'react'

export interface WriterStatus {
  projectId: string
  started: boolean
  pipeline_completed: boolean
  pipeline_failed: boolean
  progress_percent: number
  // 유닛 원값(#chat-progress-pin) — "몇 단계 중 몇 단계" 표시용. 구버전 응답엔 없을 수 있다.
  completed_units?: number
  total_units?: number
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
  // 예상 총 소요시간(ms) — 과거 완료 run 실측 기반(#c4). 기록 없으면 null(UI 숨김).
  eta_total_ms?: number | null
  eta_based_on_runs?: number
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
    //   /api/writer/keepalive 를 POST 해 끊긴 서버리스 체인을 재개한다 (fire-and-forget, cron 비의존).
    //   /api/writer/step 은 서버-투-서버 시크릿 게이트라 브라우저가 직접 부를 수 없다 — keepalive
    //   라우트가 로그인 세션으로 신원을 확인한 뒤 서버 안에서 step 을 대신 트리거한다.
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
      // 실패를 삼키지 않는다 — 이전엔 .catch(() => {}) 로 401 이 무신호로 사라져 복구 안전망이
      //   죽어 있는 걸 아무도 몰랐다(#writer-keepalive-401 사고). 최소한 console.warn 으로 남긴다.
      fetch('/api/writer/keepalive', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
        .then((r) => {
          if (!r.ok) console.warn(`[writer keepalive] ${projectId} 트리거 실패: ${r.status}`)
        })
        .catch((e) => console.warn(`[writer keepalive] ${projectId} 트리거 에러:`, e))
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
