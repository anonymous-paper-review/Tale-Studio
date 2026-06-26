'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { isPromptData, type DirectorNode } from '@/types/director'
import { cn } from '@/lib/utils'

/**
 * Higgsfield식 분리 프롬프트 노드.
 * 우측 출력 핸들(id="right")을 Shot 노드의 T 입력(id="prompt")에 연결하면
 * store.wirePromptToShot이 Shot.prompt를 이 노드 text로 동기한다.
 */
function PromptNodeImpl({ data, selected }: NodeProps<DirectorNode>) {
  if (!isPromptData(data)) return null

  return (
    <div
      className={cn(
        'group relative w-56 rounded-lg bg-node-bg-default transition-[border-width] duration-100',
        'border',
        selected
          ? 'border-2 border-primary ring-4 ring-primary/30'
          : 'border-border hover:border-2 hover:ring-4 hover:ring-primary/20',
      )}
    >
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2 !w-2 !border-0 bg-foreground/60 opacity-0 group-hover:opacity-100"
      />

      <div className="flex h-7 items-center gap-1.5 border-b border-border/60 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/50" />
        Prompt
      </div>

      <div className="p-3">
        <p
          className={cn(
            'whitespace-pre-wrap text-xs',
            data.text ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {data.text || 'Describe what you want to create...'}
        </p>
        {data.targetShotNodeId && (
          <p className="mt-2 text-[10px] text-muted-foreground">→ Shot에 연결됨</p>
        )}
      </div>
    </div>
  )
}

export const PromptNode = memo(PromptNodeImpl)
