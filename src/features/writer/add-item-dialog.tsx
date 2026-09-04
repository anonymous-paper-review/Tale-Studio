'use client'

// 샷/씬 추가 팝업 (writer 러프 스토리보드 — "샷 추가" / "씬 추가" 버튼에서 열림). #3
//
// 2-패널 구성:
//   좌(어디에) — 씬·샷 스토리를 계층 아웃라인으로 나열. 항목 사이의 "삽입 갭"에 마우스가 가까이
//     가면 회색 "이곳에 추가하기" 문구가 뜨며 갭이 벌어진다(ghost). 클릭하면 초록 잠금, 한 번 더
//     누르면 취소. 잠긴 갭이 있으면 다른 갭은 호버해도 회색 문구를 띄우지 않는다.
//     스토리 텍스트는 잘리되 호버하면 전체가 툴팁으로 뜬다(#4).
//   우(무엇을) — 새 항목의 내용 설정(샷: 타입·길이·스토리·연출 / 씬: 장소·시간·분위기·요약).
//
// 표시 번호는 "순서(위치)" 기준 — 불변 id 접미사가 아니라(중간 삽입 시 번호 뒤죽박죽 방지, #5).
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
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { useWriterStore } from '@/stores/writer-store'
import { SHOT_TYPES, SHOT_TYPE_DESCRIPTIONS } from '@/features/writer/shot-type-info'
import type { GenerationMethod, LightingConfig, ShotType } from '@/types'
import { useT } from '@/lib/i18n'

// 모듈 상수는 영어 키, 번역은 렌더 지점에서 t() (writer-progress.tsx 의 STAGE_LABELS 패턴).
// 카메라 앵글 — writer 배지(shot.camera.pan) 규칙과 왕복 일치: pan>=3=low, <=-3=high, else eye.
type CameraAngle = 'low' | 'eye' | 'high'
const CAMERA_ANGLES: Array<{ value: CameraAngle; label: string; pan: number }> = [
  { value: 'low', label: 'Low angle (looking up)', pan: 5 },
  { value: 'eye', label: 'Eye level', pan: 0 },
  { value: 'high', label: 'High angle (looking down)', pan: -5 },
]
const LIGHT_POSITIONS: Array<{ value: LightingConfig['position']; label: string }> = [
  { value: 'front', label: 'Front' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Top' },
]
const COLOR_TEMPS: Array<{ value: number; label: string }> = [
  { value: 3200, label: '3200K · warm (incandescent)' },
  { value: 4500, label: '4500K · neutral' },
  { value: 5600, label: '5600K · daylight (default)' },
  { value: 6500, label: '6500K · cool (overcast)' },
]
const GEN_METHODS: Array<{ value: GenerationMethod; label: string }> = [
  { value: 'T2V', label: 'T2V · text-to-video' },
  { value: 'I2V', label: 'I2V · image-to-video' },
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

// 잘린 스토리 텍스트 — 호버 시 전체 미리보기. 네이티브 title 사용(Radix Tooltip 은 ScrollArea 안에서
//   휠 스크롤을 막던 문제라 교체. 2026-07-11). 텍스트 없으면 플레이스홀더만.
function TruncatedStory({
  text,
  placeholder,
  className,
}: {
  text: string
  placeholder: string
  className?: string
}) {
  if (!text) return <span className={cn('truncate', className)}>{placeholder}</span>
  return (
    <span className={cn('truncate', className)} title={text}>
      {text}
    </span>
  )
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
  const t = useT()
  const key = gapKey(gap)
  // 벌어짐 = 잠긴 갭(항상) OR (잠긴 게 없고 이 갭 호버 중). 초록 잠금이 있으면 회색 호버는 억제.
  const reveal = isLocked || (!anyLocked && isHovered)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('Add here')}
      onMouseEnter={() => onHover(key)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onToggle(gap)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(gap)
        }
      }}
      // 벌어짐은 마진이 아니라 패딩으로 — 마진은 hover 박스 밖이라 커서가 걸치면 mouseLeave→접힘→재진입
      //   플리커가 난다. 패딩은 박스 안이므로 진입 후 커서가 계속 요소 위에 머문다. 접힌 hit 영역도 넉넉히.
      className={cn(
        'cursor-pointer select-none transition-all duration-200 ease-out',
        reveal ? 'py-2' : 'py-1',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center gap-1 overflow-hidden rounded-md text-xs font-medium transition-all duration-200 ease-out',
          reveal
            ? 'h-9 border border-dashed opacity-100'
            : 'h-2 border border-transparent opacity-0',
          isLocked
            ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400'
            : 'border-muted-foreground/40 text-muted-foreground',
        )}
      >
        {reveal &&
          (isLocked ? (
            <>
              <Check className="size-3.5" />
              <span>{t('Will be added here')}</span>
            </>
          ) : (
            <span>{t('Add here')}</span>
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
  const t = useT()
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
  const [cameraAngle, setCameraAngle] = useState<CameraAngle>('eye')
  const [lightPosition, setLightPosition] = useState<LightingConfig['position']>('front')
  const [colorTemp, setColorTemp] = useState(5600)
  const [brightness, setBrightness] = useState(50)
  const [genMethod, setGenMethod] = useState<GenerationMethod>('T2V')
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
    setCameraAngle('eye')
    setLightPosition('front')
    setColorTemp(5600)
    setBrightness(50)
    setGenMethod('T2V')
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
        const pan = CAMERA_ANGLES.find((a) => a.value === cameraAngle)?.pan ?? 0
        await addShot(locked.sceneId, {
          afterShotId: locked.afterShotId,
          fields: {
            shotType,
            durationSeconds,
            actionDescription: actionText.trim(),
            generationMethod: genMethod,
            camera: { horizontal: 0, vertical: 0, pan, tilt: 0, roll: 0, zoom: 0 },
            lighting: { position: lightPosition, brightness, colorTemp },
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

  const title = mode === 'shot' ? t('Add shot') : t('Add scene')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[93vh] gap-0 overflow-hidden p-0 sm:max-w-[67rem]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Choose where to add it on the left (shown in green), then set its content on the right.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 md:grid-cols-2">
            {/* ── 좌: 어디에 (아웃라인 + 삽입 갭) ─────────────────────────── */}
            {/* 네이티브 스크롤 + .scrollbar-thin — Radix ScrollArea 는 내부 Select/휠 상호작용을 깨서 교체(2026-07-11) */}
            <div className="h-[68vh] overflow-y-auto border-b scrollbar-thin md:border-b-0 md:border-r">
              <div className="px-4 py-3">
                <p className="mb-2 px-1 text-xs uppercase tracking-wider text-muted-foreground">
                  {t('Where should it go?')}
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

                {scenes.map((scene, si) => {
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
                      {/* 씬 헤더 (맥락) — 번호는 위치 기준(#5) */}
                      <div className="flex items-baseline gap-2 px-1 pt-2">
                        <span className="shrink-0 text-xs font-semibold text-foreground">
                          Scene {si + 1}
                        </span>
                        <TruncatedStory
                          text={scene.narrativeSummary}
                          placeholder={t('(no summary)')}
                          className="min-w-0 flex-1 text-xs text-muted-foreground"
                        />
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
                            {t('Empty scene')}
                          </p>
                        )}
                        {sceneShots.map((shot, ki) => {
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
                                  Shot {ki + 1}
                                </span>
                                <TruncatedStory
                                  text={shot.actionDescription}
                                  placeholder={t('(no content)')}
                                  className="min-w-0 flex-1 text-xs"
                                />
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
                    {t('No scenes yet.')}
                  </p>
                )}
              </div>
            </div>

            {/* ── 우: 무엇을 (내용 설정) ──────────────────────────────────── */}
            <div className="h-[68vh] overflow-y-auto scrollbar-thin">
              <div className="space-y-4 px-6 py-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t('Set content')}
                </p>

                {mode === 'shot' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">{t('Shot type (camera focus)')}</label>
                        <Select
                          value={shotType}
                          onValueChange={(v) => setShotType(v as ShotType)}
                        >
                          <SelectTrigger className="w-full hover-red-beam">
                            <span>{shotType}</span>
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {/* 루프 변수명 st — 바깥 스코프의 번역 함수 t 와 충돌 방지 */}
                            {SHOT_TYPES.map((st) => (
                              <SelectItem key={st} value={st}>
                                <span className="font-medium">{st}</span>
                                <span className="ml-1 text-xs text-muted-foreground">
                                  · {t(SHOT_TYPE_DESCRIPTIONS[st])}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {t(SHOT_TYPE_DESCRIPTIONS[shotType] ?? '')}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">{t('Duration (sec)')}</label>
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
                      <label className="text-sm font-medium">{t('Story (action)')}</label>
                      <HoverBeam>
                        <Textarea
                          value={actionText}
                          rows={4}
                          onChange={(e) => setActionText(e.target.value)}
                          placeholder={t('What happens in this shot')}
                        />
                      </HoverBeam>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'This becomes the source text for the rough panel, storyboard, and video generation prompts.',
                        )}
                      </p>
                    </div>

                    {/* 연출 — 카메라 앵글·조명·생성 방식. 추가 후 카드 상세에서 미세 조정 가능. */}
                    <div className="space-y-3 rounded-lg border p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        {t('Direction')}
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">{t('Camera angle')}</label>
                          <Select
                            value={cameraAngle}
                            onValueChange={(v) => setCameraAngle(v as CameraAngle)}
                          >
                            <SelectTrigger className="w-full hover-red-beam">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {CAMERA_ANGLES.map((a) => (
                                <SelectItem key={a.value} value={a.value}>
                                  {t(a.label)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">{t('Generation method')}</label>
                          <Select
                            value={genMethod}
                            onValueChange={(v) => setGenMethod(v as GenerationMethod)}
                          >
                            <SelectTrigger className="w-full hover-red-beam">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {GEN_METHODS.map((m) => (
                                <SelectItem key={m.value} value={m.value}>
                                  {t(m.label)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">{t('Light position')}</label>
                          <Select
                            value={lightPosition}
                            onValueChange={(v) =>
                              setLightPosition(v as LightingConfig['position'])
                            }
                          >
                            <SelectTrigger className="w-full hover-red-beam">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {LIGHT_POSITIONS.map((p) => (
                                <SelectItem key={p.value} value={p.value}>
                                  {t(p.label)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">{t('Color temperature')}</label>
                          <Select
                            value={String(colorTemp)}
                            onValueChange={(v) => setColorTemp(Number(v))}
                          >
                            <SelectTrigger className="w-full hover-red-beam">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper">
                              {COLOR_TEMPS.map((c) => (
                                <SelectItem key={c.value} value={String(c.value)}>
                                  {t(c.label)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center justify-between text-sm font-medium">
                          <span>{t('Brightness')}</span>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {brightness}
                          </span>
                        </label>
                        <Slider
                          min={0}
                          max={100}
                          step={5}
                          value={[brightness]}
                          onValueChange={([v]) => setBrightness(v)}
                          aria-label={t('Brightness')}
                        />
                      </div>
                    </div>

                    {lockedShotSceneChars && (
                      <p className="text-xs text-muted-foreground">
                        {t('Appearing:')} {lockedShotSceneChars.join(', ') || t('None')}
                        <span className="text-muted-foreground/70">
                          {' '}
                          {t('(inherited from the scene, adjustable after adding)')}
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">{t('Location')}</label>
                        <HoverBeam>
                          <Input
                            value={locationText}
                            onChange={(e) => setLocationText(e.target.value)}
                            placeholder={t('E.g. a desolate rocky mountain')}
                          />
                        </HoverBeam>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">{t('Time of day')}</label>
                        <HoverBeam>
                          <Input
                            value={timeText}
                            onChange={(e) => setTimeText(e.target.value)}
                            placeholder={t('E.g. day, night, dusk')}
                          />
                        </HoverBeam>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t('Mood')}</label>
                      <HoverBeam>
                        <Input
                          value={moodText}
                          onChange={(e) => setMoodText(e.target.value)}
                          placeholder={t('E.g. tense, grim')}
                        />
                      </HoverBeam>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t('Narrative summary')}</label>
                      <HoverBeam>
                        <Textarea
                          value={summaryText}
                          rows={4}
                          onChange={(e) => setSummaryText(e.target.value)}
                          placeholder={t('What happens in this scene')}
                        />
                      </HoverBeam>
                    </div>
                  </>
                )}
              </div>
            </div>
        </div>

        <DialogFooter className="items-center border-t px-6 py-4">
          <span className="mr-auto text-xs text-muted-foreground">
            {locked
              ? t('A location has been selected.')
              : t('Choose where to add it on the left.')}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
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
