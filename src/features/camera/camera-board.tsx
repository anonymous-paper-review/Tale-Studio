'use client'

// Camera 판(오너 2026-11-22 D2~D5) — 씬마다 그 씬의 샷이 세로로 선다. 데이터는 Director 와 같은 캔버스 상점(씬 · 샷 노드)이고
//   이름 · 순서는 보드와 같다(오너 2026-11-02 "전체 번호로 통일"). 조각 1 은 씬 · 샷 이름만 보인다 — 씬 단추(공용 부품, fb-director) ·
//   샷 줄 왼쪽 정보 · 오른쪽 이력 줄은 다음 조각에서 붙는다.
import { useMemo } from 'react'
import { useT } from '@/lib/i18n'
import { STAGE_LABEL } from '@/lib/constants'
import { getChildShots, useDirectorCanvasStore } from '@/stores/director-store'
import { isSceneData, isShotData } from '@/types/director'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { directorNodeLabel, sortByBoard } from '@/features/director/node-label'

export function CameraBoard() {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const names = useBoardNodeNames()
  const scenes = useMemo(
    () =>
      sortByBoard(nodes.filter((node) => isSceneData(node.data)), names).map((scene) => ({
        id: scene.id,
        label: directorNodeLabel(scene.data, names),
        shots: sortByBoard(getChildShots({ nodes }, scene.id), names).map((shot) => ({ id: shot.id, label: directorNodeLabel(shot.data, names) })),
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
    <div className="flex flex-col gap-7" data-testid="camera-board">
      {scenes.map((scene) => (
        <section key={scene.id} className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-foreground">{scene.label}</h2>
          <ul className="flex flex-col gap-2">
            {scene.shots.map((shot) => (
              <li key={shot.id} className="rounded-2xl bg-background px-4 py-3 text-label font-semibold text-foreground shadow-node">
                {shot.label}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
