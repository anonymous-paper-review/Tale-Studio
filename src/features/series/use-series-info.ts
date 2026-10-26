'use client'

// 시리즈 정보 읽기 훅(2026-10-26) — GET /api/project/[id]/series 를 한 번 읽어 돌려준다.
//   시작 화면 · Writer 띠 · Artist 카드가 같이 쓴다. 시리즈가 아닌 프로젝트는 view 가 null 이라 화면은 아무 띠도 그리지 않는다.
//   앞 화 산문이 필요한 화면만 { prose: true } 로 부른다 — 8000자까지 되는 큰 글이라 기본은 싣지 않는다.
//   프로젝트를 아직 모를 때는(projectId 없음) 부르지 않는다.
import { useEffect, useState } from 'react'
import type { SeriesView } from '@/lib/series/view'

export interface SeriesInfoState {
  view: SeriesView | null
  loading: boolean
  error: boolean
}

export function useSeriesInfo(
  projectId: string | null | undefined,
  opts?: { prose?: boolean },
): SeriesInfoState {
  const prose = opts?.prose === true
  const [state, setState] = useState<SeriesInfoState>({ view: null, loading: !!projectId, error: false })

  useEffect(() => {
    if (!projectId) {
      setState({ view: null, loading: false, error: false })
      return
    }
    let cancelled = false
    setState({ view: null, loading: true, error: false })
    void (async () => {
      try {
        const res = await fetch(`/api/project/${encodeURIComponent(projectId)}/series${prose ? '?prose=1' : ''}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { view?: SeriesView | null }
        if (!cancelled) setState({ view: body.view ?? null, loading: false, error: false })
      } catch {
        // 조회 실패는 띠를 숨기는 쪽이 안전하다 — 표시 실패가 산문 작업 자체를 막지 않는다.
        if (!cancelled) setState({ view: null, loading: false, error: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, prose])

  return state
}
