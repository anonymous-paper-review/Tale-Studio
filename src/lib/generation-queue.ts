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

let jobs: ActiveJob[] = EMPTY
let signature = ''
let projectId: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let inFlight = false
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
  inFlight = true
  try {
    const res = await fetch(
      `/api/generation/active?projectId=${encodeURIComponent(projectId)}`,
    )
    if (!res.ok) return
    const body = (await res.json()) as { data?: { jobs?: ActiveJob[] } }
    const next = body.data?.jobs ?? []
    const sig = signatureOf(next)
    if (sig === signature) return
    signature = sig
    jobs = next.length === 0 ? EMPTY : next
    emit()
  } catch {
    // 네트워크 실패는 조용히 — 다음 틱이 재시도한다. 진행 표시가 사라지는 것보다 낫다.
  } finally {
    inFlight = false
  }
}

function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(
    () => {
      void fetchOnce().finally(() => {
        if (listeners.size > 0) schedule()
      })
    },
    jobs.length > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS,
  )
}

function start(id: string) {
  if (projectId !== id) {
    projectId = id
    jobs = EMPTY
    signature = ''
  }
  void fetchOnce().finally(() => {
    if (listeners.size > 0) schedule()
  })
}

function stop() {
  if (timer) clearTimeout(timer)
  timer = null
}

/** 잡을 막 제출한 직후 호출 — 다음 폴링 틱을 기다리지 않고 진행 표시를 즉시 켠다. */
export function refreshGenerationQueue(): void {
  void fetchOnce()
}

function getSnapshot(): ActiveJob[] {
  return jobs
}

function getServerSnapshot(): ActiveJob[] {
  return EMPTY
}

/** 지금 도는 잡 목록. projectId 가 없으면 항상 빈 배열(구독도 안 건다). */
export function useActiveGenerationJobs(projectId: string | null): ActiveJob[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!projectId) return () => {}
      listeners.add(onChange)
      if (listeners.size === 1) start(projectId)
      return () => {
        listeners.delete(onChange)
        if (listeners.size === 0) stop()
      }
    },
    [projectId],
  )
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
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


