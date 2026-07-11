'use client'

// 샷 상세 팝업 (writer 러프 스토리보드 카드 클릭 시).
//
// 편집은 로컬 draft 로만 하고(실시간 저장 없음), "저장"/"저장 후 재생성" 을 눌러야 store→DB 에 커밋한다.
//   (예전엔 keystroke 마다 updateShot 디바운스 저장 → 편집 도중 서버 반영/재생성이 튀는 문제. 2026-07-11)
// 표시 번호는 "씬/샷의 순서(위치)" 기준 — 불변 id(sh_02_04 등) 접미사가 아니라(삽입 시 뒤죽박죽 방지).
// 샷 타입 설명은 툴팁이 아니라 항상 보이는 문구 + 드롭다운 항목으로 — 툴팁이 콤보박스 클릭/스크롤을 막던 문제(2026-07-11).

import { useState } from 'react'
import { Loader2, RefreshCw, Save, Trash2 } from 'lucide-react'
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
} from '@/components/ui/select'
import { useWriterStore } from '@/stores/writer-store'
import { SHOT_TYPES, SHOT_TYPE_DESCRIPTIONS } from '@/features/writer/shot-type-info'
import type { ShotType } from '@/types'

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

type ShotDraft = {
  shotType: ShotType
  durationSeconds: number
  actionDescription: string
  characters: string[]
}

export function ShotDetailDialog({
  shotId,
  panelUrl,
  generating,
  onOpenChange,
  onRegenerate,
}: ShotDetailDialogProps) {
  const shot = useWriterStore((s) => s.shots.find((x) => x.shotId === shotId))
  const shots = useWriterStore((s) => s.shots)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const updateShot = useWriterStore((s) => s.updateShot)
  const deleteShot = useWriterStore((s) => s.deleteShot)
  // updateShot 디바운스(500ms)가 DB에 닿기 전에 재생성 라우트가 행을 읽는 레이스 방지 대기
  const [flushing, setFlushing] = useState(false)
  // 로컬 편집 draft — 저장 전까지 store/DB 미반영(실시간 저장 off).
  const [draft, setDraft] = useState<ShotDraft>({
    shotType: 'MS',
    durationSeconds: 5,
    actionDescription: '',
    characters: [],
  })
  // shotId 가 바뀌면(다이얼로그가 다른 샷으로 열리면) draft 를 그 샷 원본으로 리셋.
  //   effect+setState(캐스케이드 렌더 경고) 대신 React 권장 "렌더 중 파생상태 조정" 패턴.
  const [draftForShotId, setDraftForShotId] = useState<string | null>(shotId)
  if (shotId !== draftForShotId) {
    setDraftForShotId(shotId)
    setDraft(
      shot
        ? {
            shotType: shot.shotType,
            durationSeconds: shot.durationSeconds,
            actionDescription: shot.actionDescription,
            characters: shot.characters,
          }
        : { shotType: 'MS', durationSeconds: 5, actionDescription: '', characters: [] },
    )
  }

  if (!shot) return null

  const allCharacters = sceneManifest?.characters ?? []

  // 표시 번호 = 순서(위치) 기준. store 의 scenes/shots 는 sort_order 로 정렬돼 있어 index 가 곧 위치.
  const sceneOrder = sceneManifest?.scenes.findIndex((s) => s.sceneId === shot.sceneId) ?? -1
  const shotOrder = shots
    .filter((s) => s.sceneId === shot.sceneId)
    .findIndex((s) => s.shotId === shot.shotId)
  const positionLabel =
    (sceneOrder >= 0 ? `Scene ${sceneOrder + 1} · ` : '') +
    `Shot ${shotOrder >= 0 ? shotOrder + 1 : '?'}`

  const charsChanged =
    draft.characters.length !== shot.characters.length ||
    draft.characters.some((c) => !shot.characters.includes(c))
  const dirty =
    draft.shotType !== shot.shotType ||
    draft.durationSeconds !== shot.durationSeconds ||
    draft.actionDescription !== shot.actionDescription ||
    charsChanged

  const busy = generating || flushing
  // #5 정보 가드: 액션(스토리)이 비면 러프 패널을 만들 근거가 없음 → 재생성·방향칩 잠금(서버 route 가 최종 가드).
  const hasInfo = !!draft.actionDescription.trim()

  const commitDraft = () =>
    updateShot(shot.shotId, {
      shotType: draft.shotType,
      durationSeconds: draft.durationSeconds,
      actionDescription: draft.actionDescription,
      characters: draft.characters,
    })

  const handleSave = () => {
    commitDraft()
    onOpenChange(false)
  }

  const handleRegenerate = async (styleHints?: string[]) => {
    // draft 를 먼저 저장(디바운스)하고 플러시를 기다린 뒤 재생성 — 최신 편집으로 그리게.
    commitDraft()
    setFlushing(true)
    await new Promise((r) => setTimeout(r, 700))
    setFlushing(false)
    onRegenerate(shot.shotId, styleHints)
  }

  const handleDelete = async () => {
    if (!window.confirm(`${positionLabel} 샷을 삭제할까요? 되돌릴 수 없습니다.`)) return
    onOpenChange(false)
    await deleteShot(shot.shotId)
  }

  const toggleCharacter = (id: string) =>
    setDraft((d) => ({
      ...d,
      characters: d.characters.includes(id)
        ? d.characters.filter((x) => x !== id)
        : [...d.characters, id],
    }))

  return (
    <Dialog open={!!shotId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{positionLabel}</span>
            샷 상세
          </DialogTitle>
          <DialogDescription>
            스토리·연출을 수정하고 저장을 누르면 반영됩니다. 편집 중에는 자동 저장·재생성되지 않아요.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {panelUrl && (
            <div className="overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={panelUrl}
                alt={`${positionLabel} rough storyboard`}
                className="aspect-video w-full object-cover"
              />
            </div>
          )}

          {/* 연출 요소 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">샷 타입 (카메라 초점)</label>
              <Select
                value={draft.shotType}
                onValueChange={(v) => setDraft((d) => ({ ...d, shotType: v as ShotType }))}
              >
                <SelectTrigger className="w-full hover-red-beam">
                  <span>{draft.shotType}</span>
                </SelectTrigger>
                <SelectContent>
                  {SHOT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      <span className="font-medium">{t}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        · {SHOT_TYPE_DESCRIPTIONS[t]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {SHOT_TYPE_DESCRIPTIONS[draft.shotType] ?? ''}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">길이 (초)</label>
              <HoverBeam>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.durationSeconds}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      durationSeconds: Math.max(1, Number(e.target.value) || 1),
                    }))
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
          </div>

          {/* 등장 인물 — 편집 가능(#4). 클릭해 이 샷에 넣거나 뺀다. */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">등장 인물</label>
            {allCharacters.length === 0 ? (
              <p className="text-xs text-muted-foreground">등록된 인물이 없어요.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {allCharacters.map((c) => {
                  const on = draft.characters.includes(c.characterId)
                  return (
                    <Button
                      key={c.characterId}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      className="h-7"
                      onClick={() => toggleCharacter(c.characterId)}
                    >
                      {c.name}
                    </Button>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              이 샷에 등장하는 인물을 선택하세요. 비우면 인물 없는 장면으로 그려집니다.
            </p>
          </div>

          {/* 스토리 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">스토리 (액션)</label>
            <HoverBeam>
              <Textarea
                value={draft.actionDescription}
                rows={4}
                onChange={(e) => setDraft((d) => ({ ...d, actionDescription: e.target.value }))}
                placeholder="이 샷에서 일어나는 일"
              />
            </HoverBeam>
            <p className="text-xs text-muted-foreground">
              러프 패널·콘티·영상 생성 프롬프트의 원천이 되는 문장입니다.
            </p>
            {!hasInfo && (
              <p className="text-xs text-destructive">
                스토리(액션)가 비어 있어 패널을 생성할 수 없어요. 내용을 입력하면 재생성이 열립니다.
              </p>
            )}
          </div>

          {/* 방향 칩 — 프롬프트 없이 상대 조정. 누르면 draft 저장 후 그 방향으로 변주 재생성. */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium">
              방향 조정 (재생성)
              {busy && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DIRECTION_CHIPS.map((c) => (
                <Button
                  key={c.hint}
                  size="sm"
                  variant="outline"
                  disabled={busy || !hasInfo}
                  onClick={() => void handleRegenerate([c.hint])}
                >
                  {c.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              누르면 현재 편집 내용을 저장하고 그 느낌으로 패널을 다시 그립니다.
            </p>
          </div>
        </div>

        <DialogFooter className="items-center">
          <Button
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
            disabled={busy}
          >
            <Trash2 className="size-4" />
            샷 삭제
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">저장 안 됨</span>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button variant="secondary" onClick={handleSave} disabled={busy || !dirty}>
            <Save className="size-4" />
            저장
          </Button>
          {/* #1 저장 후 재생성 — draft 커밋 + 패널 재생성(스토리 없으면 잠금). */}
          <Button onClick={() => void handleRegenerate()} disabled={busy || !hasInfo}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            저장 후 재생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
