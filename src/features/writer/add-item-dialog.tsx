'use client'

// 샷/씬 추가 팝업 (writer 러프 스토리보드 — "샷 추가" / "씬 추가" 버튼에서 열림). #3
//
// 2-패널 구성:
//   좌(어디에) — 씬·샷 스토리를 계층 아웃라인으로 나열. 항목 사이의 "삽입 갭"에 마우스가 가까이
//     가면 회색 "이곳에 추가하기" 문구가 뜨며 갭이 벌어진다(ghost). 클릭하면 초록 잠금, 한 번 더
//     누르면 취소. 잠긴 갭이 있으면 다른 갭은 호버해도 회색 문구를 띄우지 않는다.
//   우(무엇을) — 새 항목의 내용 설정(샷: 타입·길이·스토리 / 씬: 장소·시간·분위기·요약).
//
// 추가 타입(shot|scene)은 "어느 버튼으로 열었는가"로 고정 — 활성 갭은 그 레벨만(샷 모드=샷 사이,
//   씬 모드=씬 사이). 반대 레벨 항목은 맥락용으로 흐리게만 표시.
// 확정 시 writer-store.addShot/addScene(위치 삽입)으로 생성. 위치는 팝업 안의 일시적 로컬 상태.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useWriterStore } from '@/stores/writer-store'
import type { ShotType } from '@/types'

const SHOT_TYPES: ShotType[] = [
  'ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS', 'OTS', 'POV', 'TRACK', '2S',
]

export type AddMode = 'shot' | 'scene'

// 삽입 위치 — 좌 패널 갭 하나가 곧 store.addShot/addScene 의 위치 인자.
//   shot: afterShotId null=씬 맨 앞. scene: afterSceneId null=맨 앞.
type Gap =
  | { kind: 'shot'; sceneId: string; afterShotId: string | null }
  | { kind: 'scene'; afterSceneId: string | null }

function gapKey(g: Gap): string {
  return g.kind === 'shot'
    ? `shot:${g.sceneId}:${g.afterShotId ?? 'START'}`
    : `scene:${g.afterSceneId ?? 'START'}`
}

// 표시용 이름 — rough-storyboard-view 와 동일 규칙(중복이지만 컴포넌트 지역 유지).
function fmtScene(sceneId: string): string {
  const m = sceneId.match(/^sc_?(\d+)$/i)
  return m ? `Scene ${Number(m[1])}` : sceneId
}
function fmtShot(shotId: string): string {
  const m = shotId.match(/^sh_(\d+)_(\d+)$/)
  if (m) return `Shot ${Number(m[2])}`
  const m2 = shotId.match(/^shot_?(\d+)$/i)
  return m2 ? `Shot ${Number(m2[1])}` : shotId
}

interface InsertionGapProps {
  gap: Gap
  isLocked: boolean
  anyLocked: boolean
  isHovered: boolean
  onHover: (key: string | null) => void
  onToggle: (gap: Gap) => void
}

// 삽입 갭 — 평소엔 얇고 투명(맥락 방해 X). 근접 호버 시 벌어지며 회색 문구, 잠기면 초록 유지.
function InsertionGap({
  gap,
  isLocked,
  anyLocked,
  isHovered,
  onHover,
  onToggle,
}: InsertionGapProps) {
  const key = gapKey(gap)
  // 벌어짐 = 잠긴 갭(항상) OR (잠긴 게 없고 이 갭 호버 중). 초록 잠금이 있으면 회색 호버는 억제.
  const reveal = isLocked || (!anyLocked && isHovered)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="이곳에 추가하기"
      onMouseEnter={() => onHover(key)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onToggle(gap)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(gap)
        }
      }}
      className="cursor-pointer select-none"
    >
      <div
        className={cn(
          'flex items-center justify-center gap-1 overflow-hidden rounded-md text-xs font-medium transition-all duration-200 ease-out',
          reveal
            ? 'my-1.5 h-9 border border-dashed opacity-100'
            : 'my-0 h-2.5 border border-transparent opacity-0',
          isLocked
            ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400'
            : 'border-muted-foreground/40 text-muted-foreground',
        )}
      >
        {reveal &&
          (isLocked ? (
            <>
              <Check className="size-3.5" />
              <span>여기에 추가됩니다</span>
            </>
          ) : (
            <span>이곳에 추가하기</span>
          ))}
      </div>
    </div>
  )
}

interface AddItemDialogProps {
  open: boolean
  mode: AddMode
  /** shot 모드에서 "샷 추가"를 누른 씬 — 열릴 때 그 씬으로 스크롤. */
  contextSceneId?: string | null
  onOpenChange: (open: boolean) => void
}

export function AddItemDialog({
  open,
  mode,
  contextSceneId,
  onOpenChange,
}: AddItemDialogProps) {
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const shots = useWriterStore((s) => s.shots)
  const addShot = useWriterStore((s) => s.addShot)
  const addScene = useWriterStore((s) => s.addScene)

  const scenes = useMemo(() => sceneManifest?.scenes ?? [], [sceneManifest])
  const characters = useMemo(() => sceneManifest?.characters ?? [], [sceneManifest])

  const [locked, setLocked] = useState<Gap | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 우 패널 폼 — shot
  const [shotType, setShotType] = useState<ShotType>('MS')
  const [durationSeconds, setDurationSeconds] = useState(5)
  const [actionText, setActionText] = useState('')
  // 우 패널 폼 — scene
  const [summaryText, setSummaryText] = useState('')
  const [locationText, setLocationText] = useState('')
  const [timeText, setTimeText] = useState('')
  const [moodText, setMoodText] = useState('')

  const contextRef = useRef<HTMLDivElement>(null)

  // 열릴 때/모드 바뀔 때 초기화.
  useEffect(() => {
    if (!open) return
    setLocked(null)
    setHovered(null)
    setSubmitting(false)
    setShotType('MS')
    setDurationSeconds(5)
    setActionText('')
    setSummaryText('')
    setLocationText('')
    setTimeText('')
    setMoodText('')
  }, [open, mode])

  // shot 모드: 열릴 때 맥락 씬으로 스크롤.
  useEffect(() => {
    if (!open || mode !== 'shot' || !contextSceneId) return
    const t = setTimeout(() => {
      contextRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 80)
    return () => clearTimeout(t)
  }, [open, mode, contextSceneId])

  const lockedKey = locked ? gapKey(locked) : null
  const anyLocked = locked != null

  const toggleGap = (gap: Gap) => {
    setLocked((prev) => (prev && gapKey(prev) === gapKey(gap) ? null : gap))
  }

  // shot 모드에서 잠긴 갭의 씬 → 상속 등장인물 미리보기.
  const lockedShotSceneChars = useMemo(() => {
    if (!locked || locked.kind !== 'shot') return null
    const scene = scenes.find((s) => s.sceneId === locked.sceneId)
    if (!scene) return null
    return scene.charactersPresent.map(
      (id) => characters.find((c) => c.characterId === id)?.name ?? id,
    )
  }, [locked, scenes, characters])

  const handleAdd = async () => {
    if (!locked || submitting) return
    setSubmitting(true)
    try {
      if (locked.kind === 'shot') {
        await addShot(locked.sceneId, {
          afterShotId: locked.afterShotId,
          fields: {
            shotType,
            durationSeconds,
            actionDescription: actionText.trim(),
          },
        })
      } else {
        await addScene({
          afterSceneId: locked.afterSceneId,
          fields: {
            narrativeSummary: summaryText.trim(),
            location: locationText.trim(),
            timeOfDay: timeText.trim() || 'day',
            mood: moodText.trim(),
          },
        })
      }
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const title = mode === 'shot' ? '샷 추가' : '씬 추가'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4" />
            {title}
          </DialogTitle>
          <DialogDescription>
            왼쪽에서 추가할 위치를 고르고(초록 표시), 오른쪽에서 내용을 설정하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 md:grid-cols-2">
          {/* ── 좌: 어디에 (아웃라인 + 삽입 갭) ─────────────────────────── */}
          <div className="max-h-[62vh] overflow-y-auto border-b px-4 py-3 md:border-b-0 md:border-r">
            <p className="mb-2 px-1 text-xs uppercase tracking-wider text-muted-foreground">
              어디에 추가할까요
            </p>

            {/* 씬 모드: 맨 앞 갭 */}
            {mode === 'scene' && (
              <InsertionGap
                gap={{ kind: 'scene', afterSceneId: null }}
                isLocked={lockedKey === gapKey({ kind: 'scene', afterSceneId: null })}
                anyLocked={anyLocked}
                isHovered={hovered === gapKey({ kind: 'scene', afterSceneId: null })}
                onHover={setHovered}
                onToggle={toggleGap}
              />
            )}

            {scenes.map((scene) => {
              const sceneShots = shots.filter((s) => s.sceneId === scene.sceneId)
              const isContext = mode === 'shot' && scene.sceneId === contextSceneId
              const startGap: Gap = {
                kind: 'shot',
                sceneId: scene.sceneId,
                afterShotId: null,
              }
              const afterSceneGap: Gap = {
                kind: 'scene',
                afterSceneId: scene.sceneId,
              }
              return (
                <div key={scene.sceneId} ref={isContext ? contextRef : undefined}>
                  {/* 씬 헤더 (맥락) */}
                  <div className="flex items-baseline gap-2 px-1 pt-2">
                    <span className="text-xs font-semibold text-foreground">
                      {fmtScene(scene.sceneId)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {scene.narrativeSummary || '(요약 없음)'}
                    </span>
                  </div>

                  {/* 샷 목록 + (샷 모드) 갭 */}
                  <div className="pl-3">
                    {mode === 'shot' && (
                      <InsertionGap
                        gap={startGap}
                        isLocked={lockedKey === gapKey(startGap)}
                        anyLocked={anyLocked}
                        isHovered={hovered === gapKey(startGap)}
                        onHover={setHovered}
                        onToggle={toggleGap}
                      />
                    )}
                    {sceneShots.length === 0 && (
                      <p className="px-1 py-1 text-xs italic text-muted-foreground/70">
                        빈 씬
                      </p>
                    )}
                    {sceneShots.map((shot) => {
                      const afterGap: Gap = {
                        kind: 'shot',
                        sceneId: scene.sceneId,
                        afterShotId: shot.shotId,
                      }
                      return (
                        <div key={shot.shotId}>
                          <div
                            className={cn(
                              'flex items-baseline gap-2 rounded-md px-1 py-1',
                              mode === 'scene' && 'opacity-50',
                            )}
                          >
                            <span className="shrink-0 text-xs font-medium text-muted-foreground">
                              {fmtShot(shot.shotId)}
                            </span>
                            <span className="truncate text-xs">
                              {shot.actionDescription || '(내용 없음)'}
                            </span>
                          </div>
                          {mode === 'shot' && (
                            <InsertionGap
                              gap={afterGap}
                              isLocked={lockedKey === gapKey(afterGap)}
                              anyLocked={anyLocked}
                              isHovered={hovered === gapKey(afterGap)}
                              onHover={setHovered}
                              onToggle={toggleGap}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* 씬 모드: 이 씬 뒤 갭 */}
                  {mode === 'scene' && (
                    <InsertionGap
                      gap={afterSceneGap}
                      isLocked={lockedKey === gapKey(afterSceneGap)}
                      anyLocked={anyLocked}
                      isHovered={hovered === gapKey(afterSceneGap)}
                      onHover={setHovered}
                      onToggle={toggleGap}
                    />
                  )}
                </div>
              )
            })}

            {scenes.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                아직 씬이 없어요.
              </p>
            )}
          </div>

          {/* ── 우: 무엇을 (내용 설정) ──────────────────────────────────── */}
          <div className="max-h-[62vh] space-y-4 overflow-y-auto px-6 py-4">
            <p className="px-0 text-xs uppercase tracking-wider text-muted-foreground">
              내용 설정
            </p>

            {mode === 'shot' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">샷 타입</label>
                    <Select
                      value={shotType}
                      onValueChange={(v) => setShotType(v as ShotType)}
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
                        value={durationSeconds}
                        onChange={(e) =>
                          setDurationSeconds(Math.max(1, Number(e.target.value) || 1))
                        }
                        className="font-mono tabular-nums"
                      />
                    </HoverBeam>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">스토리 (액션)</label>
                  <HoverBeam>
                    <Textarea
                      value={actionText}
                      rows={4}
                      onChange={(e) => setActionText(e.target.value)}
                      placeholder="이 샷에서 일어나는 일"
                    />
                  </HoverBeam>
                  <p className="text-xs text-muted-foreground">
                    러프 패널·콘티·영상 생성 프롬프트의 원천이 되는 문장입니다.
                  </p>
                </div>

                {lockedShotSceneChars && (
                  <p className="text-xs text-muted-foreground">
                    등장: {lockedShotSceneChars.join(', ') || '없음'}
                    <span className="text-muted-foreground/70">
                      {' '}
                      (씬에서 상속 — 추가 후 조정 가능)
                    </span>
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">장소</label>
                    <HoverBeam>
                      <Input
                        value={locationText}
                        onChange={(e) => setLocationText(e.target.value)}
                        placeholder="예: 황량한 돌산"
                      />
                    </HoverBeam>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">시간대</label>
                    <HoverBeam>
                      <Input
                        value={timeText}
                        onChange={(e) => setTimeText(e.target.value)}
                        placeholder="예: 낮, 밤, 황혼"
                      />
                    </HoverBeam>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">분위기</label>
                  <HoverBeam>
                    <Input
                      value={moodText}
                      onChange={(e) => setMoodText(e.target.value)}
                      placeholder="예: 긴장된, 비장한"
                    />
                  </HoverBeam>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">서사 요약</label>
                  <HoverBeam>
                    <Textarea
                      value={summaryText}
                      rows={4}
                      onChange={(e) => setSummaryText(e.target.value)}
                      placeholder="이 씬에서 일어나는 일"
                    />
                  </HoverBeam>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="items-center border-t px-6 py-4">
          <span className="mr-auto text-xs text-muted-foreground">
            {locked
              ? '추가할 위치가 선택됐어요.'
              : '왼쪽에서 추가할 위치를 골라주세요.'}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={() => void handleAdd()} disabled={!locked || submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
