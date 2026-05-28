'use client'

import { useMemo } from 'react'
import { useDirectorCanvasStore } from '@/stores/director-canvas-store'
import { isSceneData, isShotData, isVideoData } from '@/types/director-canvas'

/**
 * 룰 기반 Director Canvas warm starting 메시지.
 * specs/layers/director_canvas.md §12.3 — 4단계 (Scene 0 / Shot 0 / Video 0 / Video ≥3).
 * LLM 호출 없음.
 */
export function useDirectorCanvasWarmStarting(): string | null {
  const nodes = useDirectorCanvasStore((s) => s.nodes)

  return useMemo(() => {
    const scenes = nodes.filter((n) => isSceneData(n.data))
    const shots = nodes.filter((n) => isShotData(n.data))
    const videos = nodes.filter((n) => isVideoData(n.data))

    if (scenes.length === 0) {
      // 캔버스 자체가 비어있을 때는 page의 빈 캔버스 hint가 더 적절 — 메시지 X
      if (nodes.length === 0) return null
      return 'Scene을 먼저 만들면 Shot들을 안으로 묶을 수 있어요. 더블클릭으로 만들거나 채팅으로 요청해보세요.'
    }

    if (shots.length === 0) {
      return '각 Scene 헤더의 Branch 아이콘 또는 채팅으로 첫 Shot을 만들어보세요. ("[씬 이름]에 클로즈업 샷 추가해줘")'
    }

    // 같은 Shot에 Video take 3개 이상 → 변주 비교 권장
    const shotWithManyTakes = shots.find((sh) => {
      const childVideos = videos.filter(
        (v) => isVideoData(v.data) && v.data.parentShotNodeId === sh.id,
      )
      return childVideos.length >= 3
    })
    if (shotWithManyTakes && isShotData(shotWithManyTakes.data)) {
      return `"${shotWithManyTakes.data.label}"의 테이크가 여러 개네요. 조명만 다른 / 렌즈만 다른 식으로 변주를 좁히면 비교가 쉬워져요.`
    }

    if (videos.length === 0) {
      return 'Shot 노드의 "새 Video 테이크 생성" 버튼이나 채팅("이 샷 영상 만들어줘")으로 첫 영상을 만들어보세요.'
    }

    // Final 마킹 안 된 Shot 있나
    const shotWithoutFinal = shots.find((sh) => {
      const childVideos = videos.filter(
        (v) => isVideoData(v.data) && v.data.parentShotNodeId === sh.id,
      )
      if (childVideos.length === 0) return false
      return !childVideos.some((v) => isVideoData(v.data) && v.data.final)
    })
    if (shotWithoutFinal && isShotData(shotWithoutFinal.data)) {
      return `"${shotWithoutFinal.data.label}"에서 마음에 드는 테이크에 ★을 찍어두면 Editor로 자동 핸드오프돼요.`
    }

    return null
  }, [nodes])
}
