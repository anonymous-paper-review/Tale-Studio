'use client'

// Camera 판(오너 2026-11-22 D2~D5) — 위 씬 단추로 고른 씬 하나의 샷 줄이 세로로 선다(scene.ts · use-camera-scene.ts). 데이터는 Director 와 같은
//   캔버스 상점(씬 · 샷 · Take 노드)이고 이름 · 순서는 보드와 같다(오너 2026-11-02 "전체 번호로 통일").
import { useT } from '@/lib/i18n'
import { countText } from '@/lib/i18n/count-text'
import { STAGE_LABEL } from '@/lib/constants'
import { useLocaleStore } from '@/stores/locale-store'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { retryBoardLoad, useBoardLoadStatus } from '@/stores/board-load-store'
import { cameraBoardView } from '@/lib/director/board-load'
import { BoardLoadState } from '@/components/board-load-state'
import { isShotData } from '@/types/director'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { useDirectorShotStates } from '@/features/director/hooks/use-shot-states'
import { directorNodeLabel } from '@/features/director/node-label'
import { CameraShotRow } from './shot-row'
import { cameraMentionLabel, mentionOnModifierClick, stopModifierPointerDown } from './mention'
import type { CameraSceneView } from './scene'

export function CameraBoard({ scene, place }: { scene: CameraSceneView | null; place: string }) {
  const t = useT()
  const names = useBoardNodeNames()
  const states = useDirectorShotStates()
  const locale = useLocaleStore((s) => s.locale)
  const shotCount = useDirectorCanvasStore((s) => s.nodes.filter((node) => isShotData(node.data)).length)
  // 판을 DB 에서 다 읽기 전 · 못 읽었으면 "아직 샷이 없어요" 대신 그 상태를 세운다 — 이 브라우저에 남은 옛 샷 줄이 있어도(fb-blur QA 2026-11-23).
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const load = useBoardLoadStatus(projectId)
  const view = cameraBoardView({ status: load, shotCount, hasScene: !!scene })

  if (view === 'loading' || view === 'failed') {
    return <BoardLoadState status={view} onRetry={retryBoardLoad} />
  }

  if (view === 'empty' || !scene) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="text-body font-semibold text-foreground">{t('No shots yet')}</p>
        <p className="text-label text-muted-foreground">{t('Make the shots in {stage} first.', { stage: STAGE_LABEL.writer })}</p>
      </div>
    )
  }

  return (
    // contain:inline-size — ScrollArea 안쪽 표(display:table)가 이력 줄 폭만큼 넓어져 줄이 판 밖으로 넘치지 않게(ScrollArea 최소 폭 함정, 11/3 QA 1번).
    <section className="flex flex-col gap-3 [contain:inline-size]" data-testid="camera-board" data-scene-key={scene.key}>
      <div className="flex min-w-0 items-baseline gap-2">
        {/* ⌘/Ctrl+클릭 = 이 씬을 채팅에 @멘션(D9) — "실사 씬 N". */}
        <h2
          className="shrink-0 text-[15px] font-semibold text-foreground"
          onPointerDownCapture={stopModifierPointerDown}
          onClickCapture={(event) => mentionOnModifierClick(event, cameraMentionLabel({ kind: 'scene', label: scene.label }, locale))}
        >
          {scene.label}
        </h2>
        <span className="min-w-0 truncate text-[12.5px] text-subtle-foreground">
          {[place, countText(t, scene.shots.length, '1 shot', '{count} shots', { count: scene.shots.length })].filter(Boolean).join(' · ')}
        </span>
      </div>
      {scene.shots.length === 0 ? (
        <p className="py-16 text-center text-label text-muted-foreground">{t('No shots in this scene yet.')}</p>
      ) : (
        scene.shots.map((shot) => (
          <CameraShotRow key={shot.id} node={shot} label={directorNodeLabel(shot.data, names)} state={states.get(shot.id) ?? 'image_needed'} />
        ))
      )}
    </section>
  )
}
