'use client'

// 진행 중 생성 잡의 클라 단일 구독 (#queue-restore).
//
// 문제: 스테이지 뷰들이 "생성 중"을 각자 컴포넌트 상태로 들고 있어서, 탭을 떠나면 증발했다.
//   돌아오면 잡은 여전히 fal 에서 도는데 화면은 아무 일도 없는 것처럼 보인다.
// 처방: 진행 중이라는 진실은 generation_jobs 의 queued 행이므로(architecture §0) 그걸 읽는다.
//   구독자가 몇이든 폴러는 하나 — 진행도 핀·러프보드·director 카드가 같은 스냅샷을 본다.
//   store 를 만들지 않은 이유: 새 진실이 아니라 DB 진실의 캐시라서(파생값은 저장하지 않는다).

import { useCallback, useSyncExternalStore } from 'react'
import type { GenerationJobKind, GenerationJobTarget } from '@/lib/generation-jobs'
import type { GenerationBatch, GenerationCompletion } from '@/lib/generation-batches'

export interface ActiveJob {
  id: string
  kind: GenerationJobKind
  target: GenerationJobTarget
  /** 제출 시각(epoch ms) — 경과시간 표시의 durable 기준점(탭 왕복에도 리셋 없음). */
  startedAt?: number | null
}

/** 도는 잡이 있을 때 / 없을 때의 폴링 간격. 없을 때 느리게 도는 이유는 "새로 시작된 잡"도
 *  이 경로로 들어오기 때문 — 다만 대부분의 시작은 refreshGenerationQueue() 로 즉시 반영된다. */
const POLL_ACTIVE_MS = 4000
const POLL_IDLE_MS = 15_000

const EMPTY: ActiveJob[] = []

/** #f4(2026-08-27 오너): 프로젝트당 영상 생성 사용량 — active 폴링 응답에 실려 온다. */
export interface VideoUsage {
  used: number
  limit: number
}

let jobs: ActiveJob[] = EMPTY
let videoUsage: VideoUsage | null = null
// 약속 D: 서버가 파생한 배치(n/N)와 완료 기록 — 같은 폴러가 받아 모든 구독자가 같은 숫자를 본다.
const EMPTY_BATCHES: GenerationBatch[] = []
const EMPTY_COMPLETIONS: GenerationCompletion[] = []
let batches: GenerationBatch[] = EMPTY_BATCHES
let completions: GenerationCompletion[] = EMPTY_COMPLETIONS
let signature = ''
let projectId: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight = false
let requestVersion = 0
let requestController: AbortController | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** 스냅샷 동일성 — useSyncExternalStore 는 참조로 비교하므로, 내용이 같으면 같은 배열을 유지한다. */
function signatureOf(next: ActiveJob[]): string {
  return next
    .map((j) => j.id)
    .sort()
    .join(',')
}

async function fetchOnce(): Promise<void> {
  if (!projectId || inFlight) return
  const requestedProjectId = projectId
  const version = requestVersion
  const controller = new AbortController()
  requestController = controller
  inFlight = true
  try {
    const res = await fetch(
      `/api/generation/active?projectId=${encodeURIComponent(requestedProjectId)}`,
      { signal: controller.signal },
    )
    if (!res.ok) return
    const body = (await res.json()) as {
      data?: { jobs?: ActiveJob[]; videoUsage?: VideoUsage; batches?: GenerationBatch[]; completions?: GenerationCompletion[] }
    }
    // 이전 프로젝트의 요청은 취소가 늦게 적용돼도 새 프로젝트 스냅샷에 반영하지 않는다.
    if (version !== requestVersion || requestedProjectId !== projectId || listeners.size === 0) return
    const next = body.data?.jobs ?? []
    const usage = body.data?.videoUsage ?? null
    const nextBatches = body.data?.batches ?? []
    const nextCompletions = body.data?.completions ?? []
    // 사용량·배치·완료 기록 변화도 emit 대상 — 시그니처에 함께 태운다(잡 목록이 그대로여도 카운트는 오른다).
    const batchSig = nextBatches.map((b) => `${b.lane}:${b.active}/${b.done}/${b.failed}/${b.total}`).join(',')
    // 개수·최신 시각만 같아도 이전 완료가 새 완료로 교체되거나 샷 수가 달라질 수 있다.
    // 전체 집계 입력을 비교하되 응답 순서만 바뀐 것은 같은 스냅샷으로 유지한다.
    const completionSig = nextCompletions.map((c) => `${c.stage}:${c.lane}:${c.at}:${c.units}`).sort().join(',')
    const sig = `${signatureOf(next)}|v:${usage ? `${usage.used}/${usage.limit}` : '-'}|b:${batchSig}|c:${completionSig}`
    if (sig === signature) return
    signature = sig
    jobs = next.length === 0 ? EMPTY : next
    videoUsage = usage
    batches = nextBatches.length === 0 ? EMPTY_BATCHES : nextBatches
    completions = nextCompletions.length === 0 ? EMPTY_COMPLETIONS : nextCompletions
    emit()
  } catch {
    // 네트워크 실패는 조용히 — 다음 틱이 재시도한다. 진행 표시가 사라지는 것보다 낫다.
  } finally {
    if (version === requestVersion) {
      inFlight = false
      requestController = null
    }
  }
}

function schedule() {
  if (timer) clearTimeout(timer)
  const version = requestVersion
  timer = setTimeout(
    () => {
      void fetchOnce().finally(() => {
        if (listeners.size > 0 && version === requestVersion) schedule()
      })
    },
    jobs.length > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS,
  )
}

function start(id: string) {
  if (projectId !== id) {
    stop()
    projectId = id
    jobs = EMPTY
    videoUsage = null
    batches = EMPTY_BATCHES
    completions = EMPTY_COMPLETIONS
    signature = ''
    emit()
  }
  const version = requestVersion
  void fetchOnce().finally(() => {
    if (listeners.size > 0 && version === requestVersion) schedule()
  })
}

function stop() {
  if (timer) clearTimeout(timer)
  timer = null
  requestVersion += 1
  requestController?.abort()
  requestController = null
  inFlight = false
}

function subscribeToProject(id: string, listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1 || projectId !== id) start(id)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}

/** 잡을 막 제출한 직후 호출 — 다음 폴링 틱을 기다리지 않고 진행 표시를 즉시 켠다. */
export function refreshGenerationQueue(): void {
  void fetchOnce()
}

function getSnapshot(id: string | null): ActiveJob[] {
  return id && id === projectId ? jobs : EMPTY
}
function getBatchesSnapshot(id: string | null): GenerationBatch[] {
  return id && id === projectId ? batches : EMPTY_BATCHES
}
function getCompletionsSnapshot(id: string | null): GenerationCompletion[] {
  return id && id === projectId ? completions : EMPTY_COMPLETIONS
}

function getVideoUsageSnapshot(id: string | null): VideoUsage | null {
  return id && id === projectId ? videoUsage : null
}

function getServerSnapshot(): ActiveJob[] {
  return EMPTY
}

/** 지금 도는 잡 목록. projectId 가 없으면 항상 빈 배열(구독도 안 건다). */
export function useActiveGenerationJobs(projectId: string | null): ActiveJob[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!projectId) return () => {}
      return subscribeToProject(projectId, onChange)
    },
    [projectId],
  )
  return useSyncExternalStore(subscribe, () => getSnapshot(projectId), getServerSnapshot)
}

/** 프로젝트당 영상 생성 사용량(#f4) — 같은 단일 폴러를 공유한다. 없으면 null(첫 응답 전). */
export function useVideoUsage(projectId: string | null): VideoUsage | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!projectId) return () => {}
      return subscribeToProject(projectId, onChange)
    },
    [projectId],
  )
  return useSyncExternalStore(subscribe, () => getVideoUsageSnapshot(projectId), () => null)
}

// ── 순수 셀렉터 (테스트 대상) ────────────────────────────────────────────────

/**
 * 잡 목록에서 대상 샷 id 집합을 뽑는다. 러프 그리드 잡은 샷을 최대 4개 묶으므로
 * writerShotIds(복수) 와 writerShotId(구 단일 경로) 를 모두 편다.
 */
export function activeShotIds(
  list: readonly ActiveJob[],
  kinds: readonly GenerationJobKind[],
): Set<string> {
  const wanted = new Set(kinds)
  const out = new Set<string>()
  for (const job of list) {
    if (!wanted.has(job.kind)) continue
    const t = job.target ?? {}
    for (const id of t.writerShotIds ?? []) out.add(id)
    if (t.writerShotId) out.add(t.writerShotId)
    if (t.shotId) out.add(t.shotId)
  }
  return out
}

/** 잡 목록에서 대상 캐릭터/로케이션 id 집합. */
export function activeAssetIds(list: readonly ActiveJob[]): {
  characters: Set<string>
  locations: Set<string>
} {
  const characters = new Set<string>()
  const locations = new Set<string>()
  for (const job of list) {
    if (job.kind === 'character_view' && job.target?.characterId) {
      characters.add(job.target.characterId)
    }
    if (job.kind === 'world_shot' && job.target?.locationId) {
      locations.add(job.target.locationId)
    }
  }
  return { characters, locations }
}

/** 해당 종류의 잡이 하나라도 도는가 — 개수 없이 "돌고 있다"만 필요한 자리. */
export function hasActiveKind(
  list: readonly ActiveJob[],
  kinds: readonly GenerationJobKind[],
): boolean {
  const wanted = new Set(kinds)
  return list.some((j) => wanted.has(j.kind))
}

/** 약속 D: 서버가 파생한 배치(레인별 n/N). 도는 잡이 없으면 빈 배열 — 핀·버튼 숫자의 단일 근거. */
export function useGenerationBatches(projectId: string | null): GenerationBatch[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!projectId) return () => {}
      return subscribeToProject(projectId, onChange)
    },
    [projectId],
  )
  return useSyncExternalStore(subscribe, () => getBatchesSnapshot(projectId), () => EMPTY_BATCHES)
}

/** 약속 D3: 최근 완료 기록(스테이지 배지의 근거). */
export function useGenerationCompletions(projectId: string | null): GenerationCompletion[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!projectId) return () => {}
      return subscribeToProject(projectId, onChange)
    },
    [projectId],
  )
  return useSyncExternalStore(subscribe, () => getCompletionsSnapshot(projectId), () => EMPTY_COMPLETIONS)
}

/** 테스트 전용 — 스냅샷 주입(서버 없이 파생 훅을 검증). */
export function _setGenerationQueueSnapshotForTests(next: { jobs?: ActiveJob[]; batches?: GenerationBatch[]; completions?: GenerationCompletion[] }): void {
  if (next.jobs) jobs = next.jobs
  if (next.batches) batches = next.batches
  if (next.completions) completions = next.completions
  emit()
}
