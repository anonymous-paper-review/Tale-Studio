'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Camera, Lightbulb } from 'lucide-react'
import { BaseNode } from './BaseNode'
import {
  getChildVideos,
  useDirectorCanvasStore,
} from '@/stores/director-canvas-store'
import { isShotData, type DirectorNode } from '@/types/director-canvas'

function ShotNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const takeCount = useDirectorCanvasStore(
    (s) => getChildVideos(s, id).length,
  )
  const addVideoTake = useDirectorCanvasStore((s) => s.addVideoTake)

  if (!isShotData(data)) return null

  // 카메라 6축 중 0 아닌 축 수
  const camActiveAxes = (
    ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'] as const
  ).filter((k) => data.camera[k] !== 0).length

  return (
    <BaseNode
      id={id}
      theme="shot"
      title={data.label}
      selected={selected}
      width={280}
      stale={data.stale}
      canBranch
      onBranch={() => {
        addVideoTake(id)
      }}
    >
      {data.prompt && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {data.prompt}
        </p>
      )}
      {data.storyboardImage?.status === 'completed' &&
        data.storyboardImage.url && (
          <div className="mt-2 aspect-video w-full overflow-hidden rounded-sm border border-border/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.storyboardImage.url}
              alt="storyboard"
              className="h-full w-full object-cover"
            />
          </div>
        )}
      {data.storyboardImage?.status === 'failed' && (
        <div className="mt-2 flex aspect-video w-full flex-col items-center justify-center gap-0.5 rounded-sm border border-destructive/50 bg-destructive/10 p-1.5 text-center">
          <span className="text-[10px] font-medium text-destructive">
            생성 실패
          </span>
          {data.storyboardImage.errorMessage && (
            <span className="line-clamp-2 break-all font-mono text-[9px] leading-tight text-destructive/80">
              {data.storyboardImage.errorMessage}
            </span>
          )}
        </div>
      )}
      {data.referenceImages.length > 0 && (
        <div className="mt-2 flex gap-1">
          {data.referenceImages.slice(0, 4).map((img) => (
            <div
              key={img.id}
              className="h-8 w-8 overflow-hidden rounded-sm border border-border/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt="ref"
                className="h-full w-full object-cover"
              />
            </div>
          ))}
          {data.referenceImages.length > 4 && (
            <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-border/40 text-[10px] text-muted-foreground">
              +{data.referenceImages.length - 4}
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-0.5">
            <Camera className="size-2.5" />
            {camActiveAxes}/6
          </span>
          <span className="flex items-center gap-0.5">
            <Lightbulb className="size-2.5" />
            {data.lighting.position}
          </span>
        </span>
        <span className="font-mono">{takeCount} take</span>
      </div>
    </BaseNode>
  )
}

export const ShotNode = memo(ShotNodeImpl)
