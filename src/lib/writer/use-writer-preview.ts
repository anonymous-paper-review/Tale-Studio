// writer 중간 산출물(스토리) 프리뷰 폴링 훅(#story-stream 2026-07-21).
//   /api/writer/preview/{projectId} 를 저빈도로 폴링해 실행 중 점진적 스토리 뷰어에 공급한다.
//   진행상태(단계/진행률/ETA)는 useWriterStatus 가 담당 — 이 훅은 콘텐츠 전용.
'use client'

import { useEffect, useRef, useState } from 'react'

export interface PreviewScene {
  sceneId: string
  index: number
  /** 씬의 scene_actions(네이티브 서사 비트) — 줄글 스토리 본문. */
  beats: string[]
}
export interface PreviewCharacter {
  id: string
  name: string
  role: string
  /** 네이티브 설명(characters 테이블). 이른 시점엔 빈 문자열일 수 있음. */
  description: string
  /** 초안 이미지(view_main) — 생성 완료 전엔 null. */
  imageUrl: string | null
}
export interface WriterPreview {
  started: boolean
  running: boolean
  completed: boolean
  failed: boolean
  roster: { slug: string; name: string }[]
  scenes: PreviewScene[]
  characters: PreviewCharacter[]
}

interface Options {
  intervalMs?: number
  /** false 면 폴링하지 않는다(완료 후 언마운트 전 정지 등). 기본 true. */
  enabled?: boolean
}

export function useWriterPreview(
  projectId: string | null | undefined,
  opts: Options = {},
): { preview: WriterPreview | null; loading: boolean } {
  const interval = opts.intervalMs ?? 4000
  const enabled = opts.enabled ?? true

  const [preview, setPreview] = useState<WriterPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!projectId || !enabled) return
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      setLoading(true)
      let stop = false
      try {
        const r = await fetch(`/api/writer/preview/${projectId}`)
        if (r.ok) {
          const j = (await r.json()) as WriterPreview
          if (!cancelled) setPreview(j)
          // 완료/실패면 한 번 더 받고 폴링 중단(마지막 산출물 반영).
          stop = !!(j.completed || j.failed)
        }
      } catch {
        // 네트워크 블립 무시 — 다음 tick 재시도.
      } finally {
        if (!cancelled) setLoading(false)
      }
      if (cancelled || stop) return
      timerRef.current = setTimeout(tick, interval)
    }

    tick()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [projectId, interval, enabled])

  return { preview, loading }
}
