'use client'

// #debug-prompts(2026-08-06): 관리자 소유 프로젝트 플래그 — 디버그 풀 프롬프트 노출과
//   정합 검사(#adherence P2, 관리자 한정) 클라 게이트가 공유한다.
//   판정은 서버(/api/debug-flags)가 하고 여기선 boolean 만 캐시한다 — 프로젝트당 1회 조회.
import { useEffect, useState } from 'react'

const flagCache = new Map<string, boolean>()
const inflight = new Map<string, Promise<boolean>>()

/** 명령형 조회(스토어·유틸용) — 훅과 같은 캐시 공유, 프로젝트당 1회 네트워크. 실패 = false. */
export function fetchDebugPrompts(projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return Promise.resolve(false)
  const hit = flagCache.get(projectId)
  if (hit !== undefined) return Promise.resolve(hit)
  const pending = inflight.get(projectId)
  if (pending) return pending
  const p = fetch(`/api/debug-flags?projectId=${encodeURIComponent(projectId)}`)
    .then((r) => (r.ok ? r.json() : { debugPrompts: false }))
    .then((d: { debugPrompts?: boolean }) => {
      const v = d?.debugPrompts === true
      flagCache.set(projectId, v)
      return v
    })
    .catch(() => false)
    .finally(() => {
      inflight.delete(projectId)
    })
  inflight.set(projectId, p)
  return p
}

export function useDebugPrompts(projectId: string | null | undefined): boolean {
  const [enabled, setEnabled] = useState<boolean>(
    projectId ? (flagCache.get(projectId) ?? false) : false,
  )

  useEffect(() => {
    if (!projectId) {
      setEnabled(false)
      return
    }
    let cancelled = false
    void fetchDebugPrompts(projectId).then((v) => {
      if (!cancelled) setEnabled(v)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return enabled
}
