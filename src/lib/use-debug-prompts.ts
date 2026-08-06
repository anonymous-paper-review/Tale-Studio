'use client'

// #debug-prompts(2026-08-06): 관리자 소유 프로젝트에서만 팝업에 생성 풀 프롬프트를 노출.
//   판정은 서버(/api/debug-flags)가 하고 여기선 boolean 만 캐시한다 — 프로젝트당 1회 조회.
import { useEffect, useState } from 'react'

const flagCache = new Map<string, boolean>()

export function useDebugPrompts(projectId: string | null | undefined): boolean {
  const [enabled, setEnabled] = useState<boolean>(
    projectId ? (flagCache.get(projectId) ?? false) : false,
  )

  useEffect(() => {
    if (!projectId) {
      setEnabled(false)
      return
    }
    const hit = flagCache.get(projectId)
    if (hit !== undefined) {
      setEnabled(hit)
      return
    }
    let cancelled = false
    void fetch(`/api/debug-flags?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : { debugPrompts: false }))
      .then((d: { debugPrompts?: boolean }) => {
        const v = d?.debugPrompts === true
        flagCache.set(projectId, v)
        if (!cancelled) setEnabled(v)
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return enabled
}
