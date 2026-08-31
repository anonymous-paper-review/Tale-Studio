'use client'

// 라벨이 붙은 입력 핸들(#handle-visibility 2026-08-31) — Higgsfield 캔버스처럼 연결
// 구멍이 항상 보이고, 무슨 입력인지 텍스트로 읽힌다. 기존 hover-only 8px 반투명 점은
// "구멍이 안 보인다"는 오너 피드백의 원인이었다: opacity-0 + 라벨 없음 + 4개가
// 20px 간격으로 겹쳐 있어 위치·역할 모두 읽을 수 없었다.

import { Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'

type Props = {
  id: string
  /** 핸들 왼쪽 밖에 항상 표시되는 짧은 기술 라벨 (예: START/END/REF/PREV) */
  label: string
  /** 노드 상단 기준 y 오프셋(px) */
  top: number
  /** 툴팁·접근성 설명 (없으면 label) */
  title?: string
  className?: string
}

export function LabeledTargetHandle({ id, label, top, title, className }: Props) {
  return (
    <Handle
      type="target"
      position={Position.Left}
      id={id}
      title={title ?? label}
      aria-label={title ?? label}
      className={cn(
        '!h-3.5 !w-3.5 !rounded-full !border-2 !border-background !bg-foreground/80',
        'transition-transform hover:!scale-125',
        className,
      )}
      style={{ top }}
    >
      <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded-sm border border-border/60 bg-background/90 px-1 font-mono text-[8px] uppercase leading-relaxed tracking-wider text-muted-foreground">
        {label}
      </span>
    </Handle>
  )
}
