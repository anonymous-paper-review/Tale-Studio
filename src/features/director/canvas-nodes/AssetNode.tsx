'use client'

// Asset 노드 — Artist에서 생성된 캐릭터/월드 에셋의 read-only 시각화.
//
// BaseNode를 쓰지 않는다: BaseNode 헤더는 항상 Edit/Branch/Delete 액션을 노출하는데
// asset은 locked(편집 불가)이므로 자물쇠만 표시하는 경량 노드로 별도 구성.
// 색: character = chart-1(Actor), world = chart-2(World) (design.md §2.2 엔티티 매핑).
// DB 미영속 파생 노드 — node.draggable=false로 위치 고정(sync가 매번 배치).

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ImageIcon, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isAssetData, type DirectorNode } from '@/types/director'

const KIND_STYLE = {
  character: { border: 'border-chart-1/70', dot: 'bg-chart-1', label: 'Character' },
  world: { border: 'border-chart-2/70', dot: 'bg-chart-2', label: 'World' },
} as const

function AssetNodeImpl({ data }: NodeProps<DirectorNode>) {
  if (!isAssetData(data)) return null
  const style = KIND_STYLE[data.assetKind]

  return (
    <div
      className={cn(
        'group relative w-[200px] overflow-hidden rounded-lg border bg-node-bg-default',
        style.border,
      )}
    >
      {/* 샷으로 향하는 출력 포트만 (우측). asset은 입력을 안 받음 */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={cn('!h-2 !w-2 !border-0 opacity-0 group-hover:opacity-100', style.dot)}
      />

      <div className="flex h-7 items-center justify-between border-b border-border/60 px-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium uppercase tracking-wide text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
          {style.label}
        </span>
        <Lock className="size-3 text-muted-foreground" aria-label="locked" />
      </div>

      <div className="flex items-center gap-2 p-2">
        <div className="size-12 shrink-0 overflow-hidden rounded bg-muted">
          {data.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={data.imageUrl}
              alt={data.label}
              className="size-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ImageIcon className="size-4 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{data.label || '(unnamed)'}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {data.assetId}
          </div>
        </div>
      </div>
    </div>
  )
}

export const AssetNode = memo(AssetNodeImpl)
