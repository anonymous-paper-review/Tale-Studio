'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { isPromptData, type DirectorNode } from '@/types/director'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

/**
 * Higgsfield식 분리 프롬프트 노드.
 * 우측 출력 핸들(id="right")을 Shot 노드의 T 입력(id="prompt")에 연결하면
 * store.wirePromptToShot이 Shot.promptOverride를 이 노드 text로 동기한다.
 */
function PromptNodeImpl({ data, selected }: NodeProps<DirectorNode>) {
  const t = useT()
  if (!isPromptData(data)) return null

  return (
    <div
      className={cn(
        // v3 D1(2026-11-03): 다른 노드와 같은 판(작업 바탕색 · 모서리 14 · 그림자 하나), 고른 노드만 지금 단계 색 테두리.
        'group relative w-56 rounded-[14px] border-[1.5px] bg-node-bg-default p-3 shadow-node transition-[border-color] duration-100',
        selected ? 'border-stage' : 'border-transparent hover:border-border',
      )}
    >
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!size-2.5 !rounded-full !border-2 !border-canvas-bg !bg-muted-foreground transition-transform hover:!scale-125"
        style={{ top: 28 }}
      />

      <div className="flex h-4 items-center gap-1.5 text-[11px] font-medium text-subtle-foreground">
        <span className={cn('size-1.5 rounded-full', selected ? 'bg-stage' : 'bg-subtle-foreground')} />
        {t('Prompt')}
      </div>

      <p
        className={cn(
          'mt-2 whitespace-pre-wrap text-[11.5px] leading-[1.45]',
          data.text ? 'text-foreground' : 'text-subtle-foreground',
        )}
      >
        {data.text || t('Describe what you want to create...')}
      </p>
      {data.targetShotNodeId && (
        <p className="mt-2 text-[11px] text-subtle-foreground">→ {t('Connected to Shot')}</p>
      )}
    </div>
  )
}

export const PromptNode = memo(PromptNodeImpl)
