'use client'

// 약속 D3·D14(2026-09-04): 왼쪽 탭 숫자는 "그 스테이지를 마지막으로 본 뒤 서버에서 완료된 생성 수".
//   화면이 완료를 직접 봤는지와 무관하게(다른 탭·새로고침·닫았다 열기) 큐의 완료 기록에서 파생한다.
//   마지막으로 본 시각은 프로젝트별로 localStorage 에 남겨 새로고침에도 숫자가 그대로다(약속 D2).
import { useCallback, useSyncExternalStore } from 'react'
import { deriveStageBadges } from '@/lib/generation-batches'
import { useGenerationCompletions } from '@/lib/generation-queue'
import type { StageId } from '@/types'

const KEY = (projectId: string) => `tale:stage-seen:${projectId}`
const listeners = new Set<() => void>()
const cache = new Map<string, Partial<Record<StageId, number>>>()

function read(projectId: string): Partial<Record<StageId, number>> {
  const hit = cache.get(projectId)
  if (hit) return hit
  let parsed: Partial<Record<StageId, number>> = {}
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY(projectId)) : null
    if (raw) parsed = JSON.parse(raw) as Partial<Record<StageId, number>>
  } catch {
    parsed = {}
  }
  cache.set(projectId, parsed)
  return parsed
}

/** 이 스테이지를 지금 봤다 — 배지가 0 이 되고, 이후 완료부터 다시 센다. */
export function markStageSeen(projectId: string, stage: StageId, at: number = Date.now()): void {
  const next = { ...read(projectId), [stage]: at }
  cache.set(projectId, next)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY(projectId), JSON.stringify(next))
  } catch {
    /* 저장 실패는 무해 — 메모리 캐시로 이 세션은 맞다 */
  }
  for (const l of listeners) l()
}

export function readStageSeen(projectId: string): Partial<Record<StageId, number>> {
  return read(projectId)
}

function useStageSeen(projectId: string | null): Partial<Record<StageId, number>> {
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [])
  const empty: Partial<Record<StageId, number>> = {}
  return useSyncExternalStore(subscribe, () => (projectId ? read(projectId) : empty), () => empty)
}

/** 사이드바 배지 — 서버 완료 기록 × 마지막으로 본 시각. 보고 있는 스테이지는 항상 0. */
export function useStageBadges(projectId: string | null, currentStage: StageId | null): Partial<Record<StageId, number>> {
  const completions = useGenerationCompletions(projectId)
  const seen = useStageSeen(projectId)
  return deriveStageBadges(completions, seen, currentStage)
}
