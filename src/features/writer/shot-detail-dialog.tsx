'use client'

// 샷 상세 팝업 (writer 러프 스토리보드 카드 클릭 시).
//
// 스토리(액션·대사)와 연출 요소(샷 타입·길이·카메라/조명 요약)를 보여주고,
// DB-backed 필드(shot_type / duration_seconds / action_description / dialogue text)는
// writer-store.updateShot 경유로 수정한다 (스토어가 500ms 디바운스로 shots 행에 저장).
// 재생성은 수정 반영을 위해 디바운스 플러시를 기다린 뒤 발사한다.

import { useState } from 'react'
import { Loader2, RefreshCw, Trash2 } from 'lucide-react'
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
import { HoverBeam } from '@/components/hover-beam'
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

// 방향 칩 — 프롬프트를 직접 쓰지 못/안 하는 사용자를 위한 상대적 연출 조정. 누르면 그 영문 수식어로
//   force 재생성(seed 변주 + Emphasis 주입). label=사람이 보는 말, hint=프롬프트에 주입되는 영문.
const DIRECTION_CHIPS: Array<{ label: string; hint: string }> = [
  { label: '더 어둡게', hint: 'darker, deeper shadows, more ominous mood' },
  { label: '더 밝게', hint: 'brighter, softer light, more open' },
  { label: '더 가까이', hint: 'tighter, closer framing on the subject' },
  { label: '더 넓게', hint: 'wider framing, more of the environment' },
  { label: '더 역동적으로', hint: 'more dynamic, stronger sense of motion and energy' },
  { label: '더 차분하게', hint: 'calmer, stiller, more balanced composition' },
]

interface ShotDetailDialogProps {
  shotId: string | null
  panelUrl: string | null
  generating: boolean
  onOpenChange: (open: boolean) => void
  onRegenerate: (shotId: string, styleHints?: string[]) => void
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
  const deleteShot = useWriterStore((s) => s.deleteShot)
  // updateShot 디바운스(500ms)가 DB에 닿기 전에 재생성 라우트가 행을 읽는 레이스 방지 대기
  const [flushing, setFlushing] = useState(false)

  if (!shot) return null

  const nameOf = (id: string) =>
    sceneManifest?.characters.find((c) => c.characterId === id)?.name ?? id

  const handleRegenerate = async (styleHints?: string[]) => {
    setFlushing(true)
    await new Promise((r) => setTimeout(r, 700))
    setFlushing(false)
    onRegenerate(shot.shotId, styleHints)
  }

  const busy = generating || flushing

  const handleDelete = async () => {
    if (!window.confirm(`${shot.shotId} 샷을 삭제할까요? 되돌릴 수 없습니다.`)) return
    onOpenChange(false)
    await deleteShot(shot.shotId)
  }

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
                <SelectTrigger className="w-full hover-red-beam">
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
              <HoverBeam>
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
              </HoverBeam>
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
            <HoverBeam>
              <Textarea
                value={shot.actionDescription}
                rows={4}
                onChange={(e) => updateShot(shot.shotId, { actionDescription: e.target.value })}
                placeholder="이 샷에서 일어나는 일"
              />
            </HoverBeam>
            <p className="text-xs text-muted-foreground">
              러프 패널·콘티·영상 생성 프롬프트의 원천이 되는 문장입니다.
            </p>
          </div>

          {/* 방향 칩 — 프롬프트 없이 상대 조정. 누르면 그 방향으로 변주 재생성(seed 변주 + Emphasis). */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">방향 조정</label>
            <div className="flex flex-wrap gap-1.5">
              {DIRECTION_CHIPS.map((c) => (
                <Button
                  key={c.hint}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleRegenerate([c.hint])}
                >
                  {c.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              프롬프트를 직접 쓰지 않아도, 방향만 누르면 그 느낌으로 변주 재생성됩니다.
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
                  <HoverBeam className="min-w-0 flex-1">
                    <Input
                      value={dl.text}
                      onChange={(e) =>
                        updateDialogueLine(shot.shotId, i, { text: e.target.value })
                      }
                    />
                  </HoverBeam>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
            disabled={busy}
          >
            <Trash2 className="size-4" />
            샷 삭제
          </Button>
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
