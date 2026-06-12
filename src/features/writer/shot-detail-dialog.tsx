'use client'

// 샷 상세 팝업 (writer 러프 스토리보드 카드 클릭 시).
//
// 스토리(액션·대사)와 연출 요소(샷 타입·길이·카메라/조명 요약)를 보여주고,
// DB-backed 필드(shot_type / duration_seconds / action_description / dialogue text)는
// writer-store.updateShot 경유로 수정한다 (스토어가 500ms 디바운스로 shots 행에 저장).
// 재생성은 수정 반영을 위해 디바운스 플러시를 기다린 뒤 발사한다.

import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useWriterStore } from '@/stores/writer-store'
import type { ShotType } from '@/types'

const SHOT_TYPES: ShotType[] = [
  'ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS', 'OTS', 'POV', 'TRACK', '2S',
]

interface ShotDetailDialogProps {
  shotId: string | null
  panelUrl: string | null
  generating: boolean
  onOpenChange: (open: boolean) => void
  onRegenerate: (shotId: string) => void
}

export function ShotDetailDialog({
  shotId,
  panelUrl,
  generating,
  onOpenChange,
  onRegenerate,
}: ShotDetailDialogProps) {
  const shot = useWriterStore((s) => s.shots.find((x) => x.shotId === shotId))
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const updateShot = useWriterStore((s) => s.updateShot)
  const updateDialogueLine = useWriterStore((s) => s.updateDialogueLine)
  // updateShot 디바운스(500ms)가 DB에 닿기 전에 재생성 라우트가 행을 읽는 레이스 방지 대기
  const [flushing, setFlushing] = useState(false)

  if (!shot) return null

  const nameOf = (id: string) =>
    sceneManifest?.characters.find((c) => c.characterId === id)?.name ?? id

  const handleRegenerate = async () => {
    setFlushing(true)
    await new Promise((r) => setTimeout(r, 700))
    setFlushing(false)
    onRegenerate(shot.shotId)
  }

  const busy = generating || flushing

  return (
    <Dialog open={!!shotId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{shot.shotId}</span>
            샷 상세
          </DialogTitle>
          <DialogDescription>
            스토리와 연출 요소를 수정하면 자동 저장되고, 재생성 시 패널에 반영됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          {panelUrl && (
            <div className="overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={panelUrl}
                alt={`${shot.shotId} rough storyboard`}
                className="aspect-video w-full object-cover"
              />
            </div>
          )}

          {/* 연출 요소 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">샷 타입</label>
              <Select
                value={shot.shotType}
                onValueChange={(v) => updateShot(shot.shotId, { shotType: v as ShotType })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHOT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">길이 (초)</label>
              <Input
                type="number"
                min={1}
                max={60}
                value={shot.durationSeconds}
                onChange={(e) =>
                  updateShot(shot.shotId, {
                    durationSeconds: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono text-xs">
              cam {shot.camera.pan >= 3 ? 'low' : shot.camera.pan <= -3 ? 'high' : 'eye-level'}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              light {shot.lighting.position} · {shot.lighting.colorTemp}K
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              {shot.generationMethod}
            </Badge>
            <span>등장: {shot.characters.map(nameOf).join(', ') || '없음'}</span>
          </div>

          {/* 스토리 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">스토리 (액션)</label>
            <Textarea
              value={shot.actionDescription}
              rows={4}
              onChange={(e) => updateShot(shot.shotId, { actionDescription: e.target.value })}
              placeholder="이 샷에서 일어나는 일"
            />
            <p className="text-xs text-muted-foreground">
              러프 패널·콘티·영상 생성 프롬프트의 원천이 되는 문장입니다.
            </p>
          </div>

          {shot.dialogueLines.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">대사</label>
              {shot.dialogueLines.map((dl, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
                    {nameOf(dl.characterId)}
                  </span>
                  <Input
                    value={dl.text}
                    onChange={(e) =>
                      updateDialogueLine(shot.shotId, i, { text: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={() => void handleRegenerate()} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            패널 재생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
