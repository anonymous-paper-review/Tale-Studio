'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { CanvasNode } from '@/stores/canvas-store'

function StatusNodeImpl({ id, data, selected }: NodeProps<CanvasNode>) {
  return <BaseNode id={id} data={data} selected={selected} theme="status" />
}

export const StatusNode = memo(StatusNodeImpl)
