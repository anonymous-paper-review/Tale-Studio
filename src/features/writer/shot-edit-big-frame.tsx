'use client'

// 샷 고치기 창 왼쪽 큰 그림(시작 · 연출 장) — 세로(9:16) · 정사각 러프도 잘리지 않고 다 보이게 한다(리드 2026-11-23 QA ③).
//   예전 칸은 그림 폭만 맞추고 높이는 창 왼쪽 줄이 나눠 주는 대로 눌렸다(넘침을 가려 최소 높이가 0) — 세로 그림은 늘 윗부분만 보였다.
//   이제 칸은 눌리지 않고(shrink-0) 그림 비율을 따른다. 세로 · 정사각이면 연출 편집기 칸과 같은 규칙(editorFrameStyle — 화면 높이 안)으로
//   폭을 줄여 가운데 두어, 시작 · 연출 탭을 오가도 그림 크기가 같다. 가로 16:9 는 지금처럼 칸 폭을 다 쓴다.
//   그림을 불러오기 전에는 프로젝트 화면 비율로 칸을 잡아(그림이 뜰 때 칸이 튀지 않게), 다 불러오면 그 그림의 실제 비율을 따른다.
//   약속: tests/writer/shot-edit-big-frame.test.ts
import { useState } from 'react'
import { ThumbImage } from '@/components/thumb-image'
import { withCacheBust } from '@/components/rough-frame-cycle'
import { editorFrameStyle } from '@/features/writer/directing-arrow-editor'
import { aspectRatioFromFormat, type ProjectFormat } from '@/types/project'

export type FrameDims = { w: number; h: number }

/** 프로젝트 화면 비율 → 칸 비율(그림을 불러오기 전). 모르면 null — 칸은 지금처럼 16:9. 순수 함수 — 테스트 대상. */
export function frameDimsFromFormat(format: ProjectFormat | null): FrameDims | null {
  if (!format) return null
  const [w, h] = aspectRatioFromFormat(format).split(':').map(Number)
  return w > 0 && h > 0 ? { w, h } : null
}

export function ShotEditBigFrame({
  url,
  generatedAt,
  caption,
  format,
  emptyLabel,
}: {
  url: string | null | undefined
  generatedAt?: number
  caption: string
  format: ProjectFormat | null
  emptyLabel: string
}) {
  const [loaded, setLoaded] = useState<FrameDims | null>(null)
  const dims = loaded ?? frameDimsFromFormat(format)
  return (
    <div
      className="relative mx-auto w-full shrink-0 overflow-hidden rounded-[14px] bg-art-placeholder"
      style={editorFrameStyle(dims)}
      data-testid="shot-edit-big-frame"
    >
      {url ? (
        <ThumbImage
          src={withCacheBust(url, generatedAt)}
          alt={caption}
          className="absolute inset-0 block size-full object-contain"
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget
            if (w > 0 && h > 0) setLoaded({ w, h })
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-caption text-muted-foreground">{emptyLabel}</div>
      )}
      <span className="pointer-events-none absolute bottom-2 right-2 rounded-[6px] bg-black/45 px-1.5 py-px text-micro font-semibold text-foreground">{caption}</span>
    </div>
  )
}
