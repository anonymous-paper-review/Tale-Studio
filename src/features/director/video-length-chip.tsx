'use client'

// 다 만든 영상 그림 위의 길이 칩 "▶ 0:05"(11/5 시안 DG, 리드 2026-11-09 c2): 만들어진 영상 파일에서 읽은 실제 길이만 쓴다.
//   샷에 적은 계획 길이로 대신하지 않고, 못 읽으면 칩을 그리지 않는다. 약속: tests/director/video-length-chip.test.ts
import { Play } from 'lucide-react'
import { useVideoLength } from '@/features/director/hooks/use-video-length'

/** 초 → "0:05" · "1:05". */
function clipLength(seconds: number): string {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function VideoLengthChip({ url }: { url: string }) {
  const seconds = useVideoLength(url)
  if (seconds === null) return null
  return (
    <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 font-num text-[11px] font-medium tabular-nums text-white">
      <Play className="size-2.5 fill-current" aria-hidden />
      {clipLength(seconds)}
    </span>
  )
}
