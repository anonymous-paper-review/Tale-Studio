'use client'

// 샷 상세 팝업 (writer 러프 스토리보드 카드 클릭 시).
//
// #arrow-layer 실험(2026-08-09): 기존 편집 폼(샷 타입·길이·인물·스토리·방향 칩·디버그 프롬프트·
//   삭제/저장/재생성)을 전부 걷어내고 DIRECTING 화살표 레이어 편집기만 남겼다.
//   원판이 필요하면 git 히스토리(2026-08-09 이전)에서 복원.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DirectingArrowEditor } from '@/features/writer/directing-arrow-editor'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import type { RoughStoryboardImage } from '@/types'

interface ShotDetailDialogProps {
  shotId: string | null
  panel: RoughStoryboardImage | null
  onOpenChange: (open: boolean) => void
}

export function ShotDetailDialog({ shotId, panel, onOpenChange }: ShotDetailDialogProps) {
  const shot = useWriterStore((s) => s.shots.find((x) => x.shotId === shotId))
  const shots = useWriterStore((s) => s.shots)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const loadProject = useWriterStore((s) => s.loadProject)
  const projectId = useProjectStore((s) => s.projectId)

  if (!shot || !projectId) return null

  // 표시 번호 = 순서(위치) 기준. store 의 scenes/shots 는 sort_order 로 정렬돼 있어 index 가 곧 위치.
  const sceneOrder = sceneManifest?.scenes.findIndex((s) => s.sceneId === shot.sceneId) ?? -1
  const shotOrder = shots
    .filter((s) => s.sceneId === shot.sceneId)
    .findIndex((s) => s.shotId === shot.shotId)
  const positionLabel =
    (sceneOrder >= 0 ? `Scene ${sceneOrder + 1} · ` : '') +
    `Shot ${shotOrder >= 0 ? shotOrder + 1 : '?'}`

  return (
    <Dialog open={!!shotId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{positionLabel}</span>
            연출 화살표 편집
          </DialogTitle>
          <DialogDescription>
            DIRECTING 프레임의 화살표를 레이어처럼 지우거나 새로 그려요. 저장하면 카드의 3프레임
            순환에 바로 반영됩니다.
          </DialogDescription>
        </DialogHeader>

        {panel && panel.status === 'completed' ? (
          <DirectingArrowEditor
            key={shot.shotId}
            projectId={projectId}
            shotId={shot.shotId}
            panel={panel}
            onSaved={() => void loadProject()}
          />
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            러프 패널이 아직 없어요. 보드에서 패널을 먼저 생성해주세요.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
