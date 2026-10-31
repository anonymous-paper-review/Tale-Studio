'use client'

// 영상 해상도 단추 · 이번에 쓸 Take 표시(오너 2026-10-31 1080p) — 영상 팝업(VideoNodePopup)과 왼쪽 상세 패널
//   (VideoDetailPanel)이 같이 쓴다. 영상 생성 모델 단추 바로 아래에 둔다. 1080p 는 720p 의 두 배 Take 를 쓰고(take-cost),
//   해상도 칸이 없는 모델(Kling O3 Pro)을 고르면 단추를 끄고 안내한다. 고른 값은 영상 노드 설정(override)에 남는다.
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import {
  VIDEO_RESOLUTION_CHOICES,
  canChooseVideoResolution,
  type VideoModelKey,
  type VideoResolution,
} from '@/lib/video-models'

export function VideoResolutionButtons({
  model,
  resolution,
  onSelect,
}: {
  model: VideoModelKey
  /** 영상 노드가 고른 해상도(getVideoNodeResolution). */
  resolution: VideoResolution
  onSelect: (resolution: VideoResolution) => void
}) {
  const t = useT()
  const selectable = canChooseVideoResolution(model)
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {VIDEO_RESOLUTION_CHOICES.map((choice) => {
          // 못 고르는 모델이면 어느 쪽도 눌린 것으로 보이지 않는다 — 그 모델은 고른 값을 쓰지 않는다.
          const pressed = selectable && resolution === choice
          return (
            <button
              key={choice}
              type="button"
              onClick={() => onSelect(choice)}
              disabled={!selectable}
              className={cn(
                'rounded-md border px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                pressed
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-accent disabled:hover:bg-transparent',
              )}
              aria-pressed={pressed}
            >
              <span className="block font-medium">{choice}</span>
            </button>
          )
        })}
      </div>
      {!selectable && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {t('This model cannot choose a resolution')}
        </p>
      )}
    </>
  )
}

/** 이번에 만들면 쓸 Take — 영상 노드의 Take 표시와 같은 계산기 · 같은 모양. 과금 모드가 꺼져 있으면 숨긴다. */
export function VideoTakeCost({
  model,
  resolution,
}: {
  model: VideoModelKey
  resolution: VideoResolution
}) {
  const t = useT()
  const takeBalance = useTakeBalance()
  if (takeBalance.mode === 'off') return null
  return (
    <span className="rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-1 text-[10px] font-medium text-foreground">
      {t('{count} Take', { count: takeCostForVideo(model, resolution) })}
    </span>
  )
}
