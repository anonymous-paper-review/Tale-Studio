'use client'

// 타임라인의 전환 · 효과 표시(2단계 ⑤, 시안 E2 409:5483 · 409:5498) — 컷 위 반투명 전환 칸, 소리 조각 끝의 페이드 칸, 이름 앞 fx 표시.
//   칸은 눌리지 않는다(아래 클립의 가장자리 끌기 · 우클릭이 그대로 된다). 약속: tests/editor/transitions-effects.test.ts
import type { AudioTrackClip } from '@/types'
import { TRANSITION_LABEL, type TransitionWindow } from '@/lib/editor/transition'
import { useT } from '@/lib/i18n'

/**
 * 효과 탭에서 끄는 동안 놓일 자리 — 클립에 data-effect-drop(start · end · whole)을 붙이면 그 절반이나 전체가 지금 단계 색으로 밝아진다
 *   (effects-panel 이 붙이고 지운다). 클립 바깥 틀이 overflow-hidden 이라 둥근 모서리 안에 그려진다.
 */
export const EFFECT_DROP_CLASS =
  'before:pointer-events-none before:absolute before:inset-y-0 before:z-[6] before:hidden before:bg-stage/30 data-[effect-drop]:before:block data-[effect-drop=start]:before:left-0 data-[effect-drop=start]:before:w-1/2 data-[effect-drop=end]:before:right-0 data-[effect-drop=end]:before:w-1/2 data-[effect-drop=whole]:before:inset-x-0'

/** 영상 효과를 넣은 클립의 이름 앞 표시(시안 E2 409:5483). */
export function FxBadge() {
  return (
    <span
      data-testid="timeline-clip-fx"
      className="mr-1 inline-flex h-2.5 items-center rounded-[2px] bg-fx-badge px-[3px] align-[1px] text-[8.5px] font-bold leading-none text-fx-badge-foreground"
    >
      fx
    </span>
  )
}

/** 한 줄의 전환 칸 — 맞닿은 컷은 경계 앞뒤로, 빈 끝은 그 자리에(시안 E2 409:5498: 흰 28% · 테두리 흰 75% · 아래에 이름). */
export function TransitionMarks({
  windows,
  trackId,
  pxPerSec,
  top,
  height,
}: {
  windows: readonly TransitionWindow[]
  trackId: string
  pxPerSec: number
  top: number
  height: number
}) {
  const t = useT()
  return (
    <>
      {windows
        .filter((w) => w.trackId === trackId)
        .map((w) => (
          <div
            key={`${w.atSec}:${w.outgoing}:${w.incoming}`}
            data-testid="timeline-transition"
            className="pointer-events-none absolute z-[5] flex items-end justify-center overflow-hidden rounded-[3px] border border-white/75 bg-white/28 pb-1"
            style={{ left: w.fromSec * pxPerSec, width: Math.max(6, (w.toSec - w.fromSec) * pxPerSec), top, height }}
          >
            <span className="truncate px-0.5 text-[7.5px] font-medium leading-none text-foreground">{t(TRANSITION_LABEL[w.type])}</span>
          </div>
        ))}
    </>
  )
}

/** 소리 조각의 페이드 칸 — 페이드 인은 왼쪽 끝, 페이드 아웃은 오른쪽 끝에서 그 길이만큼. */
export function AudioFadeMarks({ clip, pxPerSec }: { clip: Pick<AudioTrackClip, 'durationSec' | 'fadeInSec' | 'fadeOutSec'>; pxPerSec: number }) {
  const width = (sec: number) => Math.min(sec, clip.durationSec) * pxPerSec
  return (
    <>
      {clip.fadeInSec ? (
        <div
          data-testid="timeline-audio-fade"
          className="pointer-events-none absolute inset-y-0 z-[5] rounded-l-[6px] border border-white/75 bg-white/28"
          style={{ left: 0, width: width(clip.fadeInSec) }}
        />
      ) : null}
      {clip.fadeOutSec ? (
        <div
          data-testid="timeline-audio-fade"
          className="pointer-events-none absolute inset-y-0 z-[5] rounded-r-[6px] border border-white/75 bg-white/28"
          style={{ right: 0, width: width(clip.fadeOutSec) }}
        />
      ) : null}
    </>
  )
}
