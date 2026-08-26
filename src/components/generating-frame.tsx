'use client'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { ThumbImage } from '@/components/thumb-image'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

/** Writer 러프/Director Storyboard가 공유하는 카드 축척 범위. */
export const STORYBOARD_ZOOM_MIN = 1
export const STORYBOARD_ZOOM_MAX = 6
export const STORYBOARD_ZOOM_DEFAULT = 4

/** 축척 단계(1=작은 카드·6열, 6=큰 카드·1열)를 카드 열 수로 변환한다. */
export function storyboardColumns(zoomLevel: number): number {
  const level = Math.min(
    STORYBOARD_ZOOM_MAX,
    Math.max(STORYBOARD_ZOOM_MIN, Math.round(zoomLevel)),
  )
  return STORYBOARD_ZOOM_MAX + 1 - level
}

/** 카드 폭에 맞춰 설명문도 같은 단계로 줄인다. */
export function storyboardDescriptionFontSize(columns: number): string {
  const sizes: Record<number, string> = {
    1: '14px',
    2: '13px',
    3: '12px',
    4: '11px',
    5: '10.5px',
    6: '10px',
  }
  return sizes[Math.round(columns)] ?? '12px'
}

export type StoryboardZoomShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey'
>

/** 보드에 포커스가 있을 때만 처리하는 공용 축척 단축키 판정. */
export function applyStoryboardZoomShortcut(
  zoomLevel: number,
  event: StoryboardZoomShortcutEvent,
): number | null {
  if (!event.ctrlKey && !event.metaKey) return null
  if (event.key === '+' || event.key === '=') {
    return Math.min(STORYBOARD_ZOOM_MAX, zoomLevel + 1)
  }
  if (event.key === '-') return Math.max(STORYBOARD_ZOOM_MIN, zoomLevel - 1)
  return null
}

function readStoryboardZoom(storageKey: string): number {
  if (typeof window === 'undefined') return STORYBOARD_ZOOM_DEFAULT
  try {
    const saved = Number(window.localStorage.getItem(storageKey))
    return saved >= STORYBOARD_ZOOM_MIN && saved <= STORYBOARD_ZOOM_MAX
      ? saved
      : STORYBOARD_ZOOM_DEFAULT
  } catch {
    return STORYBOARD_ZOOM_DEFAULT
  }
}

/** 보드별 축척을 같은 저장·복원 규칙으로 관리한다. */
export function useStoryboardZoom(
  storageKey: string,
): [number, Dispatch<SetStateAction<number>>] {
  const [zoomLevel, setZoomLevel] = useState(() => readStoryboardZoom(storageKey))

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(zoomLevel))
    } catch {
      // localStorage 접근이 막힌 환경에서도 화면 조작은 유지한다.
    }
  }, [storageKey, zoomLevel])

  return [zoomLevel, setZoomLevel]
}

/** Writer/Director Storyboard가 공유하는 축척 조작 UI. */
export function StoryboardZoomControls({
  zoomLevel,
  onZoomLevelChange,
  className,
}: {
  zoomLevel: number
  onZoomLevelChange: Dispatch<SetStateAction<number>>
  className?: string
}) {
  const t = useT()
  const update = (next: number) =>
    onZoomLevelChange(
      Math.min(STORYBOARD_ZOOM_MAX, Math.max(STORYBOARD_ZOOM_MIN, next)),
    )

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 hover-red-beam"
        aria-label={t('Zoom out (more columns)')}
        onClick={() => update(zoomLevel - 1)}
      >
        <ZoomOut className="size-4" />
      </Button>
      <Slider
        className="w-24"
        min={STORYBOARD_ZOOM_MIN}
        max={STORYBOARD_ZOOM_MAX}
        step={1}
        value={[zoomLevel]}
        onValueChange={([value]) => {
          if (value != null) update(value)
        }}
        aria-label={t('Storyboard zoom')}
      />
      <Button
        size="icon"
        variant="ghost"
        className="size-7 hover-red-beam"
        aria-label={t('Zoom in (fewer columns)')}
        onClick={() => update(zoomLevel + 1)}
      >
        <ZoomIn className="size-4" />
      </Button>
    </div>
  )
}

/**
 * 이미지/비디오 생성 중 카드·노드 표면에 얹는 "작업 중" 오버레이.
 * - border beam: 테두리를 도는 accent 빛 (loud spinner 대체, design-references §generation-in-progress)
 * - 경과시간 pill: pulse dot + mm:ss (UI가 생성 시작을 본 시점부터 — 정직한 indeterminate 신호)
 *
 * 호출 측은 `relative` + `overflow-hidden` + (선택) `rounded-*` 컨테이너 안에 둔다.
 * 빛은 부모 radius 를 그대로 따른다(`rounded-[inherit]`).
 */
export function GeneratingOverlay({
  active,
  label,
  beamColor = 'primary',
  className,
}: {
  active: boolean
  /** pill 라벨 (예: "이미지 생성 중", "영상 생성 중") */
  label?: string
  /** 테두리 빛 색(#e13): 이미지 생성=success(초록), 영상 생성=primary(빨강). */
  beamColor?: 'primary' | 'success'
  className?: string
}) {
  const t = useT()
  if (!active) return null
  return (
    <ActiveOverlay
      label={label ?? t('Generating')}
      beamColor={beamColor}
      className={className}
    />
  )
}

function ActiveOverlay({
  label,
  beamColor,
  className,
}: {
  label: string
  beamColor: 'primary' | 'success'
  className?: string
}) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-10', className)}
      aria-label={label}
      role="status"
    >
      {/* 회전하는 accent 테두리 빛 */}
      <span
        className={cn(
          'tale-beam absolute inset-0 rounded-[inherit]',
          beamColor === 'success' && '[--beam-color:var(--success)]',
        )}
        aria-hidden
      />
      {/* 작업 중임을 알리는 옅은 scrim (glass blur 아님 — flat tint) */}
      <span
        className="absolute inset-0 rounded-[inherit] bg-background/20"
        aria-hidden
      />
      {/* 상태 pill — 경과 초는 표시하지 않는다(오너 결정 2026-08-26).
          숫자가 올라가는 것은 진행의 근거가 아니고, 느린 샷에서 오히려 불안을 준다.
          도는 빔 + pulse dot 이 "작업 중"을 말하고, 끝나면 결과 이미지/영상이 그 자리를 채운다. */}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full border border-border/60 bg-card/90 px-2 py-0.5 text-[10px] font-medium text-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        <span>{label}</span>
      </span>
    </div>
  )
}

/**
 * 생성 완료된 이미지의 blur-up reveal.
 * placeholder → 선명 이미지로 fade + 디블러 (Runway "frame breathes").
 * 썸네일 치환은 ThumbImage 가 담당(썸네일 없으면 404 → 원본 폴백). 폴백 시 onLoad 가
 * 두 번 불릴 수 있지만 loaded 는 한 방향으로만 바뀐다 — 흐림 해제가 유지되므로 무해.
 */
export function GeneratedImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)

  return (
    <ThumbImage
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      className={cn(
        'transition-[filter,opacity,transform] duration-500 ease-out',
        loaded
          ? 'blur-0 scale-100 opacity-100'
          : 'scale-[1.02] opacity-0 blur-md',
        className,
      )}
    />
  )
}


