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
import { RoughFramesStill } from '@/features/writer/rough-frames-still'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import type { RoughStoryboardImage } from '@/types'
import { useT } from '@/lib/i18n'

interface ShotDetailDialogProps {
  shotId: string | null
  panel: RoughStoryboardImage | null
  onOpenChange: (open: boolean) => void
}

export function ShotDetailDialog({ shotId, panel, onOpenChange }: ShotDetailDialogProps) {
  const t = useT()
  const shot = useWriterStore((s) => s.shots.find((x) => x.shotId === shotId))
  const shots = useWriterStore((s) => s.shots)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const loadProject = useWriterStore((s) => s.loadProject)
  const projectId = useProjectStore((s) => s.projectId)

  if (!shot || !projectId) return null

  // 표시 번호 = 순서(위치) 기준. 샷 번호는 씬별 리셋이 아니라 전역 연속(#shot-global-no 2026-08-12)
  //   — 보드 카드와 같은 번호가 떠야 "그 샷"을 부를 수 있다.
  const sceneOrder = sceneManifest?.scenes.findIndex((s) => s.sceneId === shot.sceneId) ?? -1
  let globalNo = 0
  let found = false
  for (const scene of sceneManifest?.scenes ?? []) {
    for (const s of shots.filter((x) => x.sceneId === scene.sceneId)) {
      globalNo += 1
      if (s.shotId === shot.shotId) { found = true; break }
    }
    if (found) break
  }
  const positionLabel =
    (sceneOrder >= 0 ? `Scene ${sceneOrder + 1} · ` : '') +
    `Shot ${found ? globalNo : '?'}`

  return (
    <Dialog open={!!shotId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{positionLabel}</span>
            {t('Edit directing arrows')}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Erase or draw new arrows on the DIRECTING frame like a layer. Saving applies immediately to the card's 3-frame cycle.",
            )}
          </DialogDescription>
        </DialogHeader>

        {panel && panel.status === 'completed' ? (
          <>
            {/* 약속 I: 시작·연출·끝 3장이 나란히 멈춰 보이고, 각 장 아래 "이 장만 다시 만들기". */}
            <RoughFramesStill
              key={`still-${shot.shotId}-${panel.generatedAt}`}
              projectId={projectId}
              shotId={shot.shotId}
              panel={panel}
              onRegenerated={() => void loadProject()}
            />
            <DirectingArrowEditor
              key={shot.shotId}
              projectId={projectId}
              shotId={shot.shotId}
              panel={panel}
              onSaved={() => void loadProject()}
            />
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('No rough panel yet. Generate a panel on the board first.')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
