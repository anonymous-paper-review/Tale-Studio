'use client'

// 씬 상세/수정 팝업 (writer 러프 스토리보드 — 씬 구분선의 편집 버튼에서 열림).
//   장소·시간·분위기·요약·길이를 writer-store.updateScene 으로 수정(스토어가 500ms 디바운스로 scenes 행에 저장).
//   씬 삭제(그 안의 샷 cascade)도 여기서. shot-detail-dialog 와 대칭 구조.

import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import { useWriterStore } from '@/stores/writer-store'

interface SceneEditDialogProps {
  sceneId: string | null
  onOpenChange: (open: boolean) => void
}

export function SceneEditDialog({ sceneId, onOpenChange }: SceneEditDialogProps) {
  const scene = useWriterStore((s) =>
    s.sceneManifest?.scenes.find((x) => x.sceneId === sceneId),
  )
  const updateScene = useWriterStore((s) => s.updateScene)
  const deleteScene = useWriterStore((s) => s.deleteScene)

  if (!scene) return null

  const handleDelete = async () => {
    if (
      !window.confirm(
        `${scene.sceneId} 씬과 그 안의 모든 샷을 삭제할까요? 되돌릴 수 없습니다.`,
      )
    )
      return
    onOpenChange(false)
    await deleteScene(scene.sceneId)
  }

  return (
    <Dialog open={!!sceneId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{scene.sceneId}</span>
            씬 상세
          </DialogTitle>
          <DialogDescription>
            장소·시간·분위기·요약을 수정하면 자동 저장됩니다. 다음 패널 재생성부터 반영돼요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">장소</label>
              <HoverBeam>
                <Input
                  value={scene.location ?? ''}
                  onChange={(e) => updateScene(scene.sceneId, { location: e.target.value })}
                  placeholder="예: 황량한 돌산"
                />
              </HoverBeam>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">시간대</label>
              <HoverBeam>
                <Input
                  value={scene.timeOfDay ?? ''}
                  onChange={(e) => updateScene(scene.sceneId, { timeOfDay: e.target.value })}
                  placeholder="예: Dusk"
                />
              </HoverBeam>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">분위기</label>
            <HoverBeam>
              <Input
                value={scene.mood ?? ''}
                onChange={(e) => updateScene(scene.sceneId, { mood: e.target.value })}
                placeholder="예: 긴장된, 비장한"
              />
            </HoverBeam>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">서사 요약</label>
            <HoverBeam>
              <Textarea
                value={scene.narrativeSummary ?? ''}
                rows={3}
                onChange={(e) =>
                  updateScene(scene.sceneId, { narrativeSummary: e.target.value })
                }
                placeholder="이 씬에서 일어나는 일"
              />
            </HoverBeam>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">길이 (초) — 샷 합 자동</label>
            <HoverBeam>
              <Input
                type="number"
                value={scene.estimatedDurationSeconds ?? 0}
                readOnly
                disabled
                className="font-mono tabular-nums"
              />
            </HoverBeam>
            <p className="text-xs text-muted-foreground">
              씬 길이는 포함된 샷들의 duration 합으로 자동 계산됩니다 — 샷을 추가·삭제하거나 길이를
              바꾸면 갱신돼요.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
          >
            <Trash2 className="size-4" />
            씬 삭제
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
