'use client'

import { useMemo } from 'react'
import {
  useCanvasStore,
  REGISTRATION_IMAGE_THRESHOLD,
} from '@/stores/canvas-store'

/**
 * Returns a rule-based tip string for the Meeting Room banner.
 * Priority order matches L0 spec §11.5.
 * No LLM cost — pure state derivation.
 */
export function useCanvasWarmStarting(): string | null {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)

  return useMemo(() => {
    if (nodes.length === 0) {
      return null // empty-state hint handled by MeetingRoom inline
    }

    const totalImages = nodes.reduce(
      (sum, n) => sum + n.data.generatedImages.length,
      0,
    )

    if (
      totalImages >= REGISTRATION_IMAGE_THRESHOLD - 2 &&
      totalImages < REGISTRATION_IMAGE_THRESHOLD
    ) {
      const remaining = REGISTRATION_IMAGE_THRESHOLD - totalImages
      return `캐릭터 등록까지 ${remaining}장 남았어요.`
    }

    if (nodes.length >= 2 && edges.length === 0) {
      return '두 노드 사이에 관계를 그려보세요. 핀을 끌어서 다른 노드에 연결할 수 있어요.'
    }

    const actorWithoutFiveView = nodes.find(
      (n) =>
        n.data.kind === 'actor' &&
        n.data.outputMode !== 'five-view' &&
        n.data.generatedImages.length === 0,
    )
    if (actorWithoutFiveView) {
      return '5-View 모드로 캐릭터 시트를 만들면 일관성이 좋아져요.'
    }

    return null
  }, [nodes, edges])
}
