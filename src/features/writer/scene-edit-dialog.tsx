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
import { useT } from '@/lib/i18n'

interface SceneEditDialogProps {
  sceneId: string | null
  onOpenChange: (open: boolean) => void
}

export function SceneEditDialog({ sceneId, onOpenChange }: SceneEditDialogProps) {
  const t = useT()
  const scene = useWriterStore((s) =>
    s.sceneManifest?.scenes.find((x) => x.sceneId === sceneId),
  )
  const updateScene = useWriterStore((s) => s.updateScene)
  const deleteScene = useWriterStore((s) => s.deleteScene)

  if (!scene) return null

  const handleDelete = async () => {
    if (
      !window.confirm(
        t('Delete scene {id} and all its shots? This cannot be undone.', {
          id: scene.sceneId,
        }),
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
            {t('Scene details')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Location, time, mood, and summary save automatically. Changes apply from the next panel regeneration.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('Location')}</label>
              <HoverBeam>
                <Input
                  value={scene.location ?? ''}
                  onChange={(e) => updateScene(scene.sceneId, { location: e.target.value })}
                  placeholder={t('e.g. a desolate rocky mountain')}
                />
              </HoverBeam>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('Time of day')}</label>
              <HoverBeam>
                <Input
                  value={scene.timeOfDay ?? ''}
                  onChange={(e) => updateScene(scene.sceneId, { timeOfDay: e.target.value })}
                  placeholder={t('e.g. Dusk')}
                />
              </HoverBeam>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('Mood')}</label>
            <HoverBeam>
              <Input
                value={scene.mood ?? ''}
                onChange={(e) => updateScene(scene.sceneId, { mood: e.target.value })}
                placeholder={t('e.g. tense, grim')}
              />
            </HoverBeam>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('Narrative summary')}</label>
            <HoverBeam>
              <Textarea
                value={scene.narrativeSummary ?? ''}
                rows={3}
                onChange={(e) =>
                  updateScene(scene.sceneId, { narrativeSummary: e.target.value })
                }
                placeholder={t('What happens in this scene')}
              />
            </HoverBeam>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('Duration (sec) — auto from shots')}</label>
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
              {t(
                'Scene duration is calculated automatically from the total of its shots — it updates when you add, remove, or resize shots.',
              )}
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
            {t('Delete scene')}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
