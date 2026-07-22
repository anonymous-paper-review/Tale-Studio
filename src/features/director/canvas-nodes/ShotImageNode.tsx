'use client'

// SHOT IMAGE 노드(#previz-chain 2026-07-22) — shots.storyboard_image(실사 3프레임)의 파생 표시.
//
// 진실은 부모 Shot 노드 data.storyboardImage — 이 노드는 표시 + 생성 트리거만.
// 체인에서 SHOT VIDEO 로 합류하는 하단 입력: PREVIZ SHOT VIDEO 아래에 배치된다.
// 실사 3프레임(frames)이 있으면 러프 보드와 동일한 hover 순환(START→DIRECTING→END).

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { isShotData, isShotImageData, type DirectorNode } from '@/types/director'
import { prettyNodeLabel } from '@/features/director/node-label'

function ShotImageNodeImpl({ data }: NodeProps<DirectorNode>) {
  const parentShotNodeId = isShotImageData(data) ? data.parentShotNodeId : null
  // 부모 Shot 스코프 구독 — storyboardImage 객체 참조는 노드 데이터 교체 시에만 바뀐다.
  const storyboardImage = useDirectorCanvasStore((s) => {
    if (!parentShotNodeId) return null
    const n = s.nodes.find((x) => x.id === parentShotNodeId)
    return n && isShotData(n.data) ? n.data.storyboardImage : null
  })
  const parentGenerating = useDirectorCanvasStore(
    (s) => !!parentShotNodeId && !!s.generatingNodeIds[parentShotNodeId],
  )
  const generateStoryboardImage = useDirectorCanvasStore((s) => s.generateStoryboardImage)

  if (!isShotImageData(data)) return null

  const hasImage = storyboardImage?.status === 'completed' && !!storyboardImage.url
  const generating = parentGenerating || storyboardImage?.status === 'generating'
  const failed = storyboardImage?.status === 'failed'

  return (
    <div className="group relative w-[260px] rounded-lg border border-chart-4/70 bg-node-bg-default">
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2 !w-2 !border-0 bg-chart-4 opacity-0 group-hover:opacity-100"
      />

      <div className="flex h-7 items-center justify-between border-b border-border/60 px-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium uppercase tracking-wide text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-chart-4" />
          Shot image
        </span>
        <span className="max-w-24 truncate text-[10px] text-muted-foreground">
          {prettyNodeLabel(data.label)}
        </span>
      </div>

      <div className="p-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-sm border border-border/40 bg-muted/40">
          {hasImage ? (
            storyboardImage.frames ? (
              <RoughFrameCycle panel={storyboardImage} alt={`${data.label} storyboard`} />
            ) : (
              <GeneratedImage
                src={storyboardImage.url}
                alt={`${data.label} storyboard`}
                className="h-full w-full object-cover"
              />
            )
          ) : failed ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-destructive/10 p-1.5 text-center">
              <span className="text-[10px] font-medium text-destructive">생성 실패</span>
              {storyboardImage?.errorMessage && (
                <span className="line-clamp-2 break-all font-mono text-[9px] leading-tight text-destructive/80">
                  {storyboardImage.errorMessage}
                </span>
              )}
            </div>
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <ImageIcon className="size-6 text-muted-foreground opacity-50" />
            </span>
          )}
          <GeneratingOverlay active={!!generating} label="이미지 생성 중" beamColor="success" />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (parentShotNodeId) void generateStoryboardImage(parentShotNodeId)
          }}
          disabled={!parentShotNodeId || !!generating}
          className={cn(
            'nodrag mt-2 flex h-6 w-full items-center justify-center gap-1 rounded-md border border-border text-[10px] font-medium text-foreground',
            'transition-colors duration-100 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <ImageIcon className="size-3" />
          {hasImage ? '이미지 리터칭' : '이미지 생성'}
        </button>
      </div>
    </div>
  )
}

export const ShotImageNode = memo(ShotImageNodeImpl)
