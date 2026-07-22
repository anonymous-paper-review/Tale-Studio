'use client'

// SHOT VIDEO 플레이스홀더 노드(#previz-chain 2026-07-22 피드백) — 테이크 0개인 체인 샷의
// 종점을 회색 대시 카드로 보여줘 "previz 체인이 여기서 영상이 된다"는 연결성을 안내한다.
// 생성 버튼 → generateVideoForShot(부모 샷) → 첫 테이크 노드가 생기면 rebuild 가 이 카드를 제거.

import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { isVideoData, isVideoPlaceholderData, type DirectorNode } from '@/types/director'
import { prettyNodeLabel } from '@/features/director/node-label'

function VideoPlaceholderNodeImpl({ data }: NodeProps<DirectorNode>) {
  const parentShotNodeId = isVideoPlaceholderData(data) ? data.parentShotNodeId : null
  const generateVideoForShot = useDirectorCanvasStore((s) => s.generateVideoForShot)
  // 형제 테이크가 생성 중이면 잠금 (VideoNode 의 parentGenerating 과 동일 판정)
  const parentGenerating = useDirectorCanvasStore(
    (s) =>
      !!parentShotNodeId &&
      s.nodes.some(
        (node) =>
          isVideoData(node.data) &&
          node.data.parentShotNodeId === parentShotNodeId &&
          node.data.lastAttemptStatus === 'generating',
      ),
  )
  const [busy, setBusy] = useState(false)

  if (!isVideoPlaceholderData(data)) return null

  const run = async () => {
    if (busy || !parentShotNodeId) return
    setBusy(true)
    try {
      await generateVideoForShot(parentShotNodeId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="group relative w-[240px] rounded-lg border border-dashed border-border bg-node-bg-default/60 opacity-80 transition-opacity hover:opacity-100">
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-2 !w-2 !border-0 bg-muted-foreground/60 opacity-0 group-hover:opacity-100"
      />

      <div className="flex h-7 items-center justify-between border-b border-dashed border-border/60 px-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium uppercase tracking-wide text-muted-foreground/70">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
          Shot video
        </span>
        <span className="max-w-24 truncate text-[10px] text-muted-foreground/60">
          {prettyNodeLabel(data.label)}
        </span>
      </div>

      <div className="p-2">
        <div className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border/60 bg-muted/20">
          <Play className="size-5 text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground/70">아직 영상이 없어요</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void run()
          }}
          disabled={busy || parentGenerating || !parentShotNodeId}
          className={cn(
            'nodrag mt-2 flex h-6 w-full items-center justify-center gap-1 rounded-md border border-border text-[10px] font-medium text-foreground',
            'transition-colors duration-100 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Play className="size-3 fill-current" />
          영상 생성
        </button>
      </div>
    </div>
  )
}

export const VideoPlaceholderNode = memo(VideoPlaceholderNodeImpl)
