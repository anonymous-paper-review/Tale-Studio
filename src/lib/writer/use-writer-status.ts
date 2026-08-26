// writer-pipeline 진행상황 폴링 훅
'use client'

import { useEffect, useState, useRef } from 'react'
import type { WriterEngine } from '@/lib/writer/engine'

export interface WriterStatus {
  projectId: string
  engine?: WriterEngine
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

export const WRITER_STATUS_REQUEST_TIMEOUT_MS = 15_000

export function useWriterStatus(
  projectId: string | null | undefined,
  opts: Options = {},
): { status: WriterStatus | null; loading: boolean; error: string | null; restart: () => void } {
  const interval = opts.intervalMs ?? 3000
  const stopWhenCompleted = opts.stopWhenCompleted ?? true

  const [status, setStatus] = useState<WriterStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // #stage-retry: resume 후 폴링 재개용 논스 — 완료/실패로 멈춘 루프를 다시 돌린다.
  const [nonce, setNonce] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // keepalive: 멈춘 체인을 ~60s 에 한 번만 재트리거 (스팸 방지)
  const lastKeepaliveRef = useRef(0)

  useEffect(() => {
    if (!projectId) return

    let cancelled = false
    let requestController: AbortController | null = null
    let tickVersion = 0

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
      // #stage-retry: /api/writer/step 은 서버-투-서버 전용(x-writer-secret, 8/11 fail-closed)이라
      //   브라우저 직접 호출은 프로덕션에서 401 로 조용히 죽고 있었다. 유저 세션으로 인증되는
      //   resume 라우트가 running run 에는 킥(step 재트리거)으로 동작한다.
      fetch('/api/writer/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }).catch(() => {})
    }

    const tick = async () => {
      if (cancelled) return
      // 앞 요청이 네트워크에서 매달리면 다음 tick 이 영원히 예약되지 않는다. 화면을 계속 보고 있는
      // 경우 focus/visibility 이벤트도 없으므로 F5 외엔 회복할 길이 없었다(#stale-gate).
      // 새 tick 은 앞 요청을 끊고, 각 요청도 15초 안에 끝내 다음 폴링을 반드시 예약한다.
      const version = ++tickVersion
      requestController?.abort()
      const controller = new AbortController()
      requestController = controller
      const requestTimeout = setTimeout(
        () => controller.abort(),
        WRITER_STATUS_REQUEST_TIMEOUT_MS,
      )
      setLoading(true)
      let done = false
      try {
        const r = await fetch(`/api/writer/status/${projectId}`, {
          signal: controller.signal,
        })
        if (version !== tickVersion) return
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
        if (version === tickVersion) {
          setError(
            e instanceof DOMException && e.name === 'AbortError'
              ? 'Writer status request timed out'
              : e instanceof Error
                ? e.message
                : String(e),
          )
        }
      } finally {
        clearTimeout(requestTimeout)
        if (version === tickVersion) {
          requestController = null
          setLoading(false)
        }
      }
      // 완료/실패면 더 폴링 안 함
      if (cancelled || version !== tickVersion) return
      if (done && stopWhenCompleted) return
      timerRef.current = setTimeout(tick, interval)
    }

    tick()

    // Same wake-recovery as the artist gate (#stale-gate 2026-08-26): a backgrounded tab has
    // its timers throttled, so the poll that would have flipped the bar to "done" can be
    // delayed for minutes. Without this the progress bar sits at 93% until F5 - which is
    // exactly what the owner hit (server finished 23:07:33, screen still showed 93%).
    const onWake = () => {
      if (cancelled) return
      if (document.visibilityState !== 'visible') return
      if (timerRef.current) clearTimeout(timerRef.current)
      void tick()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)

    return () => {
      cancelled = true
      tickVersion += 1
      requestController?.abort()
      requestController = null
      if (timerRef.current) clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [projectId, interval, stopWhenCompleted, nonce])

  return { status, loading, error, restart: () => setNonce((n) => n + 1) }
}
