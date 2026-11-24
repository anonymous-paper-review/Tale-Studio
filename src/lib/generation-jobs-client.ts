// 클라이언트용 generation_jobs polling 헬퍼 (webhook 비동기 전환).
//
// 생성 submit 라우트가 jobId를 반환하면, 인증된 /api/generation-jobs 를 완료까지 polling한다.
// 한 탭에 스케줄러 하나: 틱마다 등록된 잡을 모아 묶어 묻고(1개면 단일 주소), 일시 오류에는 간격을 늘려 다시 묻는다.
// 라우트가 queued면 FAL을 직접 reconcile하므로 webhook이 없어도(로컬 터널 없음) 결과를 받는다.
// 여러 store가 공유 (store 간 import 금지 규칙 회피 — 공용 lib).
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
// 서버가 "유령"으로 보는 시각과 맞춘다(#poll-timeout-align 2026-09-08) — 따로 적으면 조용히 어긋난다.
import {
  POLL_BACKOFF_MAX_MS,
  POLL_INTERVAL_MS,
  POLL_REQUEST_TIMEOUT_MS,
  STALE_QUEUED_MS,
  staleQueuedMsFor,
} from '@/lib/generation-job-timing'

export type GenerationJobLifecycle =
  | 'queued'
  | 'completed'
  | 'failed'
  | 'deduped'
  | 'skipped'
  | 'timed_out'
  /** 화면에서 멈춘 작업(오너 2026-11-14 7번) — 뒤늦게 끝나도 지금 그림을 바꾸지 않고 기록에만 남았다. */
  | 'cancelled'

export interface GenerationJobReceipt {
  jobId: string | null
  status: GenerationJobLifecycle
  resultUrl?: string | null
  error?: string | null
  httpStatus?: number | null
  /** 자리 없음(429) 거절이면 어느 자리였는지 — 내 한도(user) · 모두의 자리(global). 이어 그리기가 멈출지 기다릴지 고른다. */
  quotaScope?: 'user' | 'global' | null
}

export type GenerationJobObserver = (receipt: GenerationJobReceipt) => void

// 약속 D8(2026-09-04): 같은 잡을 두 번 폴링하지 않는다 — Artist 탭을 떠났다 돌아올 때마다 loadData 가 queued 잡을
//   다시 폴링 걸던 것을, 잡 id 당 진행 중인 폴링 하나로 합친다. 두 번째 호출자는 같은 결과(Promise)를 받는다.
const inFlightPolls = new Map<string, Promise<string>>()

/** 테스트·진단용: 지금 도는 폴링 수. */
export function inFlightPollCount(): number {
  return inFlightPolls.size
}

interface PollJob {
  jobId: string
  intervalMs: number
  startedAt: number
  /** 지금 서버에 묻는 중이면 true — 다음 틱이 건너뛴다. */
  asking: boolean
  /** 이 시각을 넘기면 포기한다. 처음엔 그림 기준, 응답의 kind 가 영상이면 영상 기준으로 늘어난다. */
  timeoutMs: number
  onStatus?: GenerationJobObserver
  resolve: (url: string) => void
  reject: (error: Error) => void
}

interface JobPayload {
  status?: string
  resultUrl?: string | null
  error?: string | null
  kind?: string | null
}

const DEFAULT_BATCH_MAX = 50

const jobs = new Map<string, PollJob>()
let timer: ReturnType<typeof setTimeout> | null = null
let kickQueued = false
let consecutiveTransientFailures = 0
// 리셋 뒤에 돌아온 옛 틱의 응답이 새 상태를 건드리지 않게 한다.
let epoch = 0

/** 테스트용: 스케줄러·백오프·등록된 폴링을 처음 상태로 되돌린다. */
export function _resetGenerationJobPollingForTests(): void {
  if (timer) clearTimeout(timer)
  timer = null
  consecutiveTransientFailures = 0
  epoch += 1
  jobs.clear()
  inFlightPolls.clear()
}

export function pollGenerationJob(
  jobId: string,
  opts: {
    intervalMs?: number
    onStatus?: GenerationJobObserver
  } = {},
): Promise<string> {
  const existing = inFlightPolls.get(jobId)
  if (existing) return existing
  const timeoutMs = STALE_QUEUED_MS
  const run = new Promise<string>((resolve, reject) => {
    jobs.set(jobId, {
      jobId,
      intervalMs: opts.intervalMs ?? POLL_INTERVAL_MS,
      startedAt: Date.now(),
      asking: false,
      timeoutMs,
      onStatus: opts.onStatus,
      resolve,
      reject,
    })
  })
  inFlightPolls.set(jobId, run)
  // 같은 동기 구간에 등록되는 잡을 한 요청으로 묶으려고 첫 질문은 마이크로태스크로 미룬다(타이머를 쓰지 않아 가짜 시계에서도 바로 나간다).
  if (!timer && !kickQueued) {
    kickQueued = true
    queueMicrotask(() => {
      kickQueued = false
      if (!timer) tick()
    })
  }
  return run
}

function batchMax(): number {
  const value = Number(process.env.NEXT_PUBLIC_POLL_BATCH_MAX ?? DEFAULT_BATCH_MAX)
  return Number.isInteger(value) && value >= 1 ? value : DEFAULT_BATCH_MAX
}

function finish(job: PollJob, outcome: { url: string } | { error: Error }): void {
  if (jobs.get(job.jobId) !== job) return
  jobs.delete(job.jobId)
  if (inFlightPolls.has(job.jobId)) inFlightPolls.delete(job.jobId)
  if ('url' in outcome) job.resolve(outcome.url)
  else job.reject(outcome.error)
}

function notify(job: PollJob, receipt: GenerationJobReceipt): boolean {
  // 이미 끝난(시간 초과 등) 잡에 늦은 응답이 와도 알림을 다시 보내지 않는다.
  if (jobs.get(job.jobId) !== job) return false
  try {
    job.onStatus?.(receipt)
    return true
  } catch (error) {
    finish(job, { error: error instanceof Error ? error : new Error(String(error)) })
    return false
  }
}

function fail(job: PollJob, receipt: Omit<GenerationJobReceipt, 'jobId' | 'status'>, message: string): void {
  if (!notify(job, { jobId: job.jobId, status: 'failed', ...receipt })) return
  finish(job, { error: new Error(message) })
}

function applyPayload(job: PollJob, data: JobPayload): void {
  if (data.kind) job.timeoutMs = Math.max(job.timeoutMs, staleQueuedMsFor(data.kind))
  if (data.status === 'completed') {
    if (!data.resultUrl) {
      fail(job, { error: 'Completed, but no result URL' }, translate(useLocaleStore.getState().locale, 'Completed, but no result URL'))
      return
    }
    if (!notify(job, { jobId: job.jobId, status: 'completed', resultUrl: data.resultUrl })) return
    finish(job, { url: data.resultUrl })
    return
  }
  if (data.status === 'failed') {
    fail(job, { error: data.error ?? 'Generation failed' }, data.error ?? translate(useLocaleStore.getState().locale, 'Generation failed'))
    return
  }
  notify(job, { jobId: job.jobId, status: 'queued' })
}

function expireOverdue(): void {
  const now = Date.now()
  for (const job of [...jobs.values()]) {
    if (now - job.startedAt <= job.timeoutMs) continue
    const message = 'Generation is taking longer than expected. It may still finish in the background.'
    if (!notify(job, { jobId: job.jobId, status: 'timed_out', error: message })) continue
    finish(job, { error: new Error(translate(useLocaleStore.getState().locale, message)) })
  }
}

function isPermanentStatus(status: number): boolean {
  if (status === 401 || status === 403 || status === 404) return true
  // 그 밖의 4xx 는 요청 자체가 틀린 것이라 다시 물어도 같다. 시간 초과(408)와 과속(429)만 일시로 본다.
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

/** 한 묶음을 묻고, 일시 오류였으면 true 를 돌려준다. */
async function askBatch(batch: PollJob[]): Promise<boolean> {
  const ids = batch.map((job) => job.jobId)
  const single = ids.length === 1
  const url = single
    ? `/api/generation-jobs/${encodeURIComponent(ids[0])}`
    : `/api/generation-jobs?ids=${ids.map(encodeURIComponent).join(',')}`
  let res: Response | null = null
  let body: unknown = null
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(POLL_REQUEST_TIMEOUT_MS) })
    if (res.ok || isPermanentStatus(res.status)) body = await res.json().catch(() => (res!.ok ? undefined : {}))
  } catch {
    res = null
  }
  const status = res?.status ?? null

  if (res && !res.ok && isPermanentStatus(res.status)) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`
    for (const job of batch) fail(job, { httpStatus: res.status, error: message }, message)
    return false
  }

  const data = res?.ok ? (body as { data?: unknown } | undefined)?.data : undefined
  if (!res || !res.ok || !data || typeof data !== 'object') {
    for (const job of batch) notify(job, { jobId: job.jobId, status: 'queued', httpStatus: status })
    return true
  }

  if (single) {
    applyPayload(batch[0], data as JobPayload)
    return false
  }
  const { jobs: byId = {}, missing = [] } = data as { jobs?: Record<string, JobPayload>; missing?: string[] }
  for (const job of batch) {
    if (missing.includes(job.jobId)) {
      fail(job, { httpStatus: 404, error: 'HTTP 404' }, 'HTTP 404')
    } else if (byId[job.jobId]) {
      applyPayload(job, byId[job.jobId])
    } else {
      notify(job, { jobId: job.jobId, status: 'queued' })
    }
  }
  return false
}

// 틱은 setTimeout 순차다. 요청이 오래 걸리는 동안 새로 등록된 잡만 따로 한 번 더 깨워 묻고(이미 묻는 중인 잡은 건너뛴다),
//   먼저 나간 요청 하나가 새 잡의 첫 질문을 시간 초과까지 막지 않게 한다.
function tick(): void {
  timer = null
  expireOverdue()
  const idle = [...jobs.values()].filter((job) => !job.asking)
  const max = batchMax()
  for (let i = 0; i < idle.length; i += max) {
    const batch = idle.slice(i, i + max)
    for (const job of batch) job.asking = true
    void runBatch(batch)
  }
}

async function runBatch(batch: PollJob[]): Promise<void> {
  const myEpoch = epoch
  const transient = await askBatch(batch)
  if (myEpoch !== epoch) return
  for (const job of batch) job.asking = false
  consecutiveTransientFailures = transient ? consecutiveTransientFailures + 1 : 0
  scheduleNext()
}

function scheduleNext(): void {
  if (timer) return
  const waiting = [...jobs.values()].filter((job) => !job.asking)
  if (waiting.length === 0) return
  const base = Math.min(...waiting.map((job) => job.intervalMs))
  const delay = Math.min(POLL_BACKOFF_MAX_MS, base * 2 ** consecutiveTransientFailures)
  timer = setTimeout(tick, delay)
}
