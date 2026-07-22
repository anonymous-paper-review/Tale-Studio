'use client'

// 3프레임(START→DIRECTING→END) 순환 표시 — writer 러프 보드와 director 스토리보드(실사 3프레임,
//   #real-strip 2026-07-22)가 공유. 원래 rough-storyboard-view.tsx 로컬이던 것을 공용화.
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import type { RoughStoryboardImage } from '@/types/shot'

// 재생성 즉시 반영: 스토리지 url 은 같은 경로 덮어쓰기(upsert)라 URL 이 동일 → 브라우저/CDN 캐시 잔상이 남는다.
//   generatedAt 을 쿼리로 붙여 매 생성마다 src 가 바뀌게 해 새 이미지를 즉시 가져온다.
export function withCacheBust(url: string, v?: number): string {
  if (!v) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
}

// 3프레임 순환 라벨 — START → DIRECTING(연출 화살표/지시) → END (2026-07-22 라벨 영문 통일).
const FRAME_LABELS = ['START', 'DIRECTING', 'END'] as const
const FRAME_CYCLE_MS = 1200

/** 3프레임 순환 표시(#rough-grid 2026-07-22) — 기본은 START 정지 프레임, hover 중에만 순환
 *  (전 카드 동시 재생은 정보 과다 — 2026-07-22 피드백). 점 클릭 = 그 프레임 고정(leave 시 리셋).
 *  frames 없는 구버전 패널(단일 이미지)은 정적 표시로 폴백.
 *  panel 은 RoughStoryboardImage 또는 구조 호환 StoryboardImage(실사 3프레임). */
export function RoughFrameCycle({
  panel,
  alt,
}: {
  panel: Pick<RoughStoryboardImage, 'url' | 'generatedAt' | 'frames'>
  alt: string
}) {
  const f = panel.frames
  const urls = f
    ? [f.start, f.direction, f.end].map((u) => withCacheBust(u, panel.generatedAt))
    : [withCacheBust(panel.url, panel.generatedAt)]
  const [idx, setIdx] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  const multi = urls.length > 1

  useEffect(() => {
    if (!multi || !hovering || pinned) return
    const t = setInterval(() => setIdx((i) => (i + 1) % urls.length), FRAME_CYCLE_MS)
    return () => clearInterval(t)
  }, [multi, hovering, pinned, urls.length])

  const current = idx % urls.length
  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        // 카드를 떠나면 START 정지 상태로 복귀 — 보드 전체가 조용해진다.
        setHovering(false)
        setPinned(false)
        setIdx(0)
      }}
    >
      {/* 프레임 전환 시 로딩 깜빡임 방지 — 3장을 모두 마운트하고 opacity 로 스위치 */}
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={u}
          src={u}
          alt={i === current ? alt : ''}
          aria-hidden={i !== current}
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-150',
            i === current ? 'opacity-100' : 'opacity-0',
          )}
          loading="lazy"
          draggable={false}
        />
      ))}
      {/* 인디케이터는 hover 중에만 — 기본 상태의 시각 노이즈 제거 */}
      {multi && hovering ? (
        <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-background/70 px-2 py-0.5 backdrop-blur-sm">
          {urls.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${FRAME_LABELS[i]} 프레임 고정`}
              onClick={(e) => {
                e.stopPropagation()
                setIdx(i)
                setPinned(true)
              }}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                i === current ? 'bg-primary' : 'bg-muted-foreground/40 hover:bg-muted-foreground',
              )}
            />
          ))}
          <span className="ml-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
            {FRAME_LABELS[current]}
          </span>
        </div>
      ) : null}
    </div>
  )
}
