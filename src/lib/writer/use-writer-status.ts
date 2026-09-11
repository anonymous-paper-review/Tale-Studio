// writer-pipeline 진행상황 폴링 훅
'use client'

import { useCallback, useSyncExternalStore } from 'react'
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
  // #coverage-first: shotCheck 결정론 연출 점검(완주 시). 구버전 응답엔 없을 수 있다.
  directing_issues?: Array<{ severity: string; location: string; message: string; suggestion: string | null }>
  // 구 응답과의 형식 호환용. 검토 대기·부분 실행이 구분된 표본이 없어 서버는 null/0을 반환한다.
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

export function useWriterStatus(projectId: string | null | undefined, opts: Options = {}) {
  const intervalMs = opts.intervalMs ?? 3000
  const stopWhenCompleted = opts.stopWhenCompleted ?? true
  const subscribe = useCallback((listener: () => void) => projectId
    ? subscribeWriterStatus(projectId, listener, { intervalMs, stopWhenCompleted })
    : () => {}, [projectId, intervalMs, stopWhenCompleted])
  const snapshot = useSyncExternalStore(subscribe, () => readWriterStatus(projectId), () => EMPTY_WRITER_STATUS)
  const restart = useCallback(() => { if (projectId) restartWriterStatus(projectId) }, [projectId])
  return { ...snapshot, restart }
}

// 같은 프로젝트의 진행창은 요청과 상태 사본을 공유한다. 마지막 구독이 끝나면 요청도 해제한다.
export const WRITER_STATUS_REQUEST_TIMEOUT_MS = 15_000
interface Snapshot { status: WriterStatus | null; loading: boolean; error: string | null }
interface Entry {
  snapshot: Snapshot
  subscribers: Map<() => void, { intervalMs: number; stopWhenCompleted: boolean }>
  timer?: ReturnType<typeof setTimeout>
  requestController?: AbortController
  version: number
  keepaliveAt: number
  wake?: () => void
}
export const EMPTY_WRITER_STATUS: Snapshot = { status: null, loading: false, error: null }
const entries = new Map<string, Entry>()
function entryFor(id: string): Entry {
  let entry = entries.get(id)
  if (!entry) {
    entry = { snapshot: EMPTY_WRITER_STATUS, subscribers: new Map(), version: 0, keepaliveAt: 0 }
    entries.set(id, entry)
  }
  return entry
}
export function readWriterStatus(id: string | null | undefined): Snapshot {
  return id ? entries.get(id)?.snapshot ?? EMPTY_WRITER_STATUS : EMPTY_WRITER_STATUS
}
function publish(entry: Entry, patch: Partial<Snapshot>) {
  entry.snapshot = { ...entry.snapshot, ...patch }
  for (const listener of entry.subscribers.keys()) listener()
}
async function tick(id: string, entry: Entry) {
  if (!entry.subscribers.size) return
  clearTimeout(entry.timer)
  entry.timer = undefined
  entry.requestController?.abort()
  const version = ++entry.version
  const controller = new AbortController()
  entry.requestController = controller
  const timeout = setTimeout(() => controller.abort(), WRITER_STATUS_REQUEST_TIMEOUT_MS)
  publish(entry, { loading: true })
  let terminal = false
  try {
    const response = await fetch(`/api/writer/status/${id}`, { signal: controller.signal })
    const body = await response.json()
    if (entry.version !== version || !entry.subscribers.size) return
    if (!response.ok) throw new Error(body.error ?? `status ${response.status}`)
    const status = body as WriterStatus
    terminal = !!(status.pipeline_completed || status.pipeline_failed)
    publish(entry, { status, error: null })
    // 기존 회복 간격 유지. 검토 대기에는 자동 재개하지 않는다.
    const age = status.last_timestamp ? Date.now() - Date.parse(status.last_timestamp) : 0
    if (status.started && !status.pipeline_completed && !status.pipeline_failed && status.current_status !== 'awaiting_confirmation'
      && age >= 180_000 && Date.now() - entry.keepaliveAt >= 60_000) {
      entry.keepaliveAt = Date.now()
      void fetch('/api/writer/resume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: id }) }).catch(() => {})
    }
  } catch (error) {
    if (entry.version === version && entry.subscribers.size) publish(entry, { error: error instanceof Error ? error.message : String(error) })
  } finally {
    clearTimeout(timeout)
    if (entry.version === version && entry.subscribers.size) {
      entry.requestController = undefined
      publish(entry, { loading: false })
      const options = [...entry.subscribers.values()].filter(o => !terminal || !o.stopWhenCompleted)
      if (options.length) entry.timer = setTimeout(() => void tick(id, entry), Math.min(...options.map(o => o.intervalMs)))
    }
  }
}
export function restartWriterStatus(id: string) {
  const entry = entries.get(id)
  if (entry) void tick(id, entry)
}
export function subscribeWriterStatus(id: string, listener: () => void, options: { intervalMs?: number; stopWhenCompleted?: boolean } = {}) {
  const entry = entryFor(id)
  entry.subscribers.set(listener, { intervalMs: options.intervalMs ?? 3000, stopWhenCompleted: options.stopWhenCompleted ?? true })
  if (entry.subscribers.size === 1) {
    const wake = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') void tick(id, entry) }
    entry.wake = wake
    if (typeof window !== 'undefined') window.addEventListener('focus', wake)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake)
    void tick(id, entry)
  } else if (!entry.requestController && !entry.timer && options.stopWhenCompleted === false) {
    void tick(id, entry)
  }
  return () => {
    entry.subscribers.delete(listener)
    if (entry.subscribers.size) return
    entry.version++
    entry.requestController?.abort()
    clearTimeout(entry.timer)
    if (entry.wake) {
      if (typeof window !== 'undefined') window.removeEventListener('focus', entry.wake)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', entry.wake)
    }
    entries.delete(id)
  }
}
