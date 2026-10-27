'use client'

// 시리즈 정보 읽기 훅(2026-10-26) — GET /api/project/[id]/series 를 읽어 돌려준다.
//   시작 화면 · Writer 띠 · Artist 카드가 같이 쓴다. 시리즈가 아닌 프로젝트는 view 가 null 이라 화면은 아무 띠도 그리지 않는다.
//   앞 화 산문이 필요한 화면만 { prose: true } 로 부른다 — 8000자까지 되는 큰 글이라 기본은 싣지 않는다.
//   프로젝트를 아직 모를 때는(projectId 없음) 부르지 않는다.
//
// 2026-10-27 오너 "고치셈": 읽은 정보를 프로젝트별로 들고 있다가 탭 · 화면이 다시 열리면 바로 쓴다.
//   전에는 탭 카드가 열릴 때마다 처음부터 다시 읽었고(운영 한 번에 약 3초), 그동안 이어받음 표시가 없고
//   보관한 배경이 이번 화 배경 사이에 섞여 보였다. 바로 쓴 뒤에도 서버에서 다시 읽어 바뀐 것을 반영한다.
//   약속: tests/artist/series-info-reuse.test.ts
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { SeriesView } from '@/lib/series/view'

export interface SeriesInfoState {
  view: SeriesView | null
  loading: boolean
  error: boolean
}

// 화면이 같은 값을 받으면 다시 그리지 않도록 상태 객체는 바뀔 때만 새로 만든다.
const IDLE: SeriesInfoState = { view: null, loading: false, error: false }
const LOADING: SeriesInfoState = { view: null, loading: true, error: false }

const known = new Map<string, SeriesInfoState>()
const reading = new Map<string, Promise<void>>()
const watchers = new Map<string, Set<() => void>>()

const keyOf = (projectId: string, prose: boolean) => `${projectId}${prose ? '|prose' : ''}`

/** 지금 들고 있는 시리즈 정보. 처음 읽는 프로젝트는 읽는 중, 프로젝트를 모르면 빈 상태. */
export function readSeriesInfo(projectId: string | null | undefined, prose: boolean): SeriesInfoState {
  if (!projectId) return IDLE
  return known.get(keyOf(projectId, prose)) ?? LOADING
}

/** 같은 프로젝트의 시리즈 정보가 새로 읽히면 부른다. 돌려준 함수로 그만 듣는다. */
export function subscribeSeriesInfo(projectId: string, prose: boolean, onChange: () => void): () => void {
  const key = keyOf(projectId, prose)
  const set = watchers.get(key) ?? new Set<() => void>()
  set.add(onChange)
  watchers.set(key, set)
  return () => {
    set.delete(onChange)
    if (set.size === 0) watchers.delete(key)
  }
}

/**
 * 서버에서 다시 읽는다. 같은 것을 읽는 중이면 그 읽기를 같이 기다린다.
 *   다시 읽다 실패하면 들고 있던 정보를 그대로 둔다 — 처음부터 실패했을 때만 실패로 둔다(띠를 숨기는 쪽이 안전하다).
 */
export function loadSeriesInfo(projectId: string, prose: boolean): Promise<void> {
  const key = keyOf(projectId, prose)
  const running = reading.get(key)
  if (running) return running
  const job = (async () => {
    let next: SeriesInfoState
    try {
      const res = await fetch(`/api/project/${encodeURIComponent(projectId)}/series${prose ? '?prose=1' : ''}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { view?: SeriesView | null }
      next = { view: body.view ?? null, loading: false, error: false }
    } catch {
      next = known.get(key) ?? { view: null, loading: false, error: true }
    }
    known.set(key, next)
    reading.delete(key)
    for (const onChange of watchers.get(key) ?? []) onChange()
  })()
  reading.set(key, job)
  return job
}

export function useSeriesInfo(
  projectId: string | null | undefined,
  opts?: { prose?: boolean },
): SeriesInfoState {
  const prose = opts?.prose === true
  const subscribe = useCallback(
    (onChange: () => void) => (projectId ? subscribeSeriesInfo(projectId, prose, onChange) : () => {}),
    [projectId, prose],
  )
  // 서버 그리기는 들고 있는 정보를 쓰지 않는다 — 서버의 모듈 값은 모든 사용자가 같이 쓰기 때문이다.
  const state = useSyncExternalStore(
    subscribe,
    () => readSeriesInfo(projectId, prose),
    () => (projectId ? LOADING : IDLE),
  )

  useEffect(() => {
    if (projectId) void loadSeriesInfo(projectId, prose)
  }, [projectId, prose])

  return state
}
