'use client'

// Camera 판(오너 2026-11-22 D2~D5) — 씬마다 그 씬의 샷 줄이 세로로 선다. 데이터는 Director 와 같은 캔버스 상점(씬 · 샷 · Take 노드)이고
//   이름 · 순서는 보드와 같다(오너 2026-11-02 "전체 번호로 통일"). 씬 단추(공용 components/scene-buttons, fb-director)가 들어오면
//   한 번에 한 씬만 보인다 — 그 전에는 씬을 모두 차례로 보인다.
import { useMemo } from 'react'
import { useT } from '@/lib/i18n'
import { STAGE_LABEL } from '@/lib/constants'
import { getChildShots, useDirectorCanvasStore } from '@/stores/director-store'
import { isSceneData, isShotData } from '@/types/director'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { useDirectorShotStates } from '@/features/director/hooks/use-shot-states'
import { directorNodeLabel, sortByBoard } from '@/features/director/node-label'
import { CameraShotRow } from './shot-row'

export function CameraBoard() {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const names = useBoardNodeNames()
  const states = useDirectorShotStates()
  const scenes = useMemo(
    () =>
      sortByBoard(nodes.filter((node) => isSceneData(node.data)), names).map((scene) => ({
        id: scene.id,
        label: directorNodeLabel(scene.data, names),
        shots: sortByBoard(getChildShots({ nodes }, scene.id), names),
      })),
    [nodes, names],
  )
  const shotCount = nodes.filter((node) => isShotData(node.data)).length

  if (shotCount === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="text-body font-semibold text-foreground">{t('No shots yet')}</p>
        <p className="text-label text-muted-foreground">{t('Make the shots in {stage} first.', { stage: STAGE_LABEL.writer })}</p>
      </div>
    )
  }

  return (
    // contain:inline-size — ScrollArea 안쪽 표(display:table)가 이력 줄 폭만큼 넓어져 줄이 판 밖으로 넘치지 않게(ScrollArea 최소 폭 함정, 11/3 QA 1번).
    <div className="flex flex-col gap-7 [contain:inline-size]" data-testid="camera-board">
      {scenes.map((scene) => (
        <section key={scene.id} className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-foreground">{scene.label}</h2>
          {scene.shots.map((shot) => (
            <CameraShotRow key={shot.id} node={shot} label={directorNodeLabel(shot.data, names)} state={states.get(shot.id) ?? 'image_needed'} />
          ))}
        </section>
      ))}
    </div>
  )
}
