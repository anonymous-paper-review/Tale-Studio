'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import {
  getChildShots,
  nextShotPosition,
  useDirectorCanvasStore,
} from '@/stores/director-canvas-store'
import { isSceneData, type DirectorNode } from '@/types/director-canvas'

function SceneNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const childCount = useDirectorCanvasStore(
    (s) => getChildShots(s, id).length,
  )
  const addShotNode = useDirectorCanvasStore((s) => s.addShotNode)

  if (!isSceneData(data)) return null

  const handleBranch = () => {
    const state = useDirectorCanvasStore.getState()
    const pos = nextShotPosition(state, id)
    addShotNode(id, pos)
  }

  return (
    <BaseNode
      id={id}
      theme="scene"
      title={data.label}
      selected={selected}
      width={280}
      canBranch
      onBranch={handleBranch}
    >
      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
        {data.location && (
          <div className="line-clamp-1">📍 {data.location}</div>
        )}
        {data.timeOfDay && (
          <div className="line-clamp-1">🕐 {data.timeOfDay}</div>
        )}
        {data.mood && <div className="line-clamp-1">🎭 {data.mood}</div>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-mono">scene</span>
        <span className="font-mono">{childCount} shot</span>
      </div>
    </BaseNode>
  )
}

export const SceneNode = memo(SceneNodeImpl)
