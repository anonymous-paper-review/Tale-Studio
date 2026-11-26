// 영상 효과(2단계 ⑤, 시안 E2 409:5334–5346) — 흑백 · 가우시안 흐림 · 밝기 및 대비. 클립마다 넣은 효과만 칸이 있다(VideoClip.effects).
//   모니터는 영상 그림에 CSS filter 로 입힌다(videoEffectFilter) — 내보낸 영상에는 ⑦에서 같은 글을 캔버스 filter 에 싣는다.
//   가우시안 흐림은 [일정하게](값 하나) 또는 [시작 → 끝](클립 처음 값에서 끝 값까지 곧은 줄)이다(D14, 2026-11-22) — 그 시각의 세기는
//   그릴 것 목록(selectFrameAt)이 blurAt 으로 한 번 셈해 층에 싣고, 모니터 · 내보내기가 그 값을 같이 쓴다.
//   타이틀 카드에는 넣지 않는다. 약속: tests/editor/transitions-effects.test.ts · tests/editor/blur-ramp.test.ts
import type { ClipEffects, VideoClip } from '@/types/shot'

/** 효과 종류 — 효과 탭 · 효과 컨트롤 · 빼기의 단위. 흐림의 끝 값(blurEnd)은 흐림의 칸이라 종류가 아니다. */
export type VideoEffectKind = 'blackWhite' | 'blur' | 'brightnessContrast'

/** 효과 탭 · 효과 컨트롤의 차례(시안 E2 409:5337–5345). */
export const VIDEO_EFFECTS: readonly VideoEffectKind[] = ['blackWhite', 'blur', 'brightnessContrast']
/** 화면 이름 — 영어는 프리미어 이름, 한국어는 사전(오너 결정 4). */
export const VIDEO_EFFECT_LABEL: Record<VideoEffectKind, string> = {
  blackWhite: 'Black & White',
  blur: 'Gaussian blur',
  brightnessContrast: 'Brightness & Contrast',
}
/** 넣자마자의 값 — 흑백 켬, 흐림 30%(넣자마자 보이게, [일정하게]), 밝기 · 대비 0%(프리미어와 같다). */
export const VIDEO_EFFECT_DEFAULT: Required<Pick<ClipEffects, VideoEffectKind>> = {
  blackWhite: true,
  blur: 0.3,
  brightnessContrast: { brightness: 0, contrast: 0 },
}
/** [시작 → 끝]으로 바꿀 때의 끝 값 — 0%(흐렸다가 또렷해짐, 방안 D14 의 쓰임새). % 를 두 번 누르면 돌아가는 값도 같다. */
export const BLUR_END_DEFAULT = 0
/** 흐림 100% = 화면 틀 폭의 4% 반지름 — 모니터 크기가 바뀌어도 같은 흐림이다. */
const BLUR_FULL_RATIO = 0.04

/** 흐림 방식 — [일정하게] · [시작 → 끝](D14). */
export type BlurMode = 'constant' | 'ramp'

/** 효과 컨트롤에서 바꾸는 값 — 그 효과를 넣은 클립에만 들어간다. */
export interface VideoEffectPatch {
  blackWhite?: boolean
  /** 흐림 — [일정하게]면 그 값, [시작 → 끝]이면 시작 값. */
  blur?: number
  /** 흐림 끝 값 — [시작 → 끝]인 클립에만 들어간다(일정한 클립을 저절로 바꾸지 않는다). */
  blurEnd?: number
  /** 흐림 방식 — 'ramp' 면 끝 값 0%를 더하고(시작 = 지금 값), 'constant' 면 끝 값을 지워 시작 값 하나가 된다. */
  blurMode?: BlurMode
  brightness?: number
  contrast?: number
}

const round3 = (n: number) => Math.round(n * 1000) / 1000
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0))

/** 넣은 효과가 있는가 — 효과 종류 칸만 센다(예전 Editor 가 흐림만 빼 끝 값 칸만 남은 클립은 효과 없는 클립이다). */
export function hasVideoEffects(clip: Pick<VideoClip, 'effects'> | undefined): boolean {
  const effects = clip?.effects
  return !!effects && VIDEO_EFFECTS.some((kind) => effects[kind] !== undefined)
}

/** 흐림 방식 — 흐림과 끝 값 칸이 함께 있으면 [시작 → 끝], 그 밖은 [일정하게]. */
export function blurMode(effects: ClipEffects | undefined): BlurMode {
  return effects?.blur !== undefined && effects.blurEnd !== undefined ? 'ramp' : 'constant'
}

/**
 * 클립 진행(0 = 클립이 시작할 때, 1 = 끝날 때)의 흐림 세기(0 ~ 1) — [일정하게]면 그 값, [시작 → 끝]이면 시작 값에서 끝 값까지 곧은 줄(D14
 *   "무조건 선형"). 클립 밖(교차 디졸브로 경계 너머에 그려지는 동안)은 시작 · 끝 값에 멈춘다. 흐림이 없으면 undefined.
 */
export function blurAt(effects: ClipEffects | undefined, progress: number): number | undefined {
  const start = effects?.blur
  if (start === undefined) return undefined
  const end = effects?.blurEnd
  if (end === undefined) return start
  const p = clamp(progress, 0, 1)
  return start + (end - start) * p
}

/** 넣은 효과에만 값을 바꾼다 — 흐림 · 끝 값 0 ~ 1, 밝기 · 대비 −1 ~ 1. 없는 효과는 더하지 않는다. */
export function patchEffects(effects: ClipEffects, patch: VideoEffectPatch): ClipEffects {
  const next: ClipEffects = { ...effects }
  if (patch.blackWhite !== undefined && next.blackWhite !== undefined) next.blackWhite = patch.blackWhite
  if (patch.blur !== undefined && next.blur !== undefined) next.blur = round3(clamp(patch.blur, 0, 1))
  if (next.blur !== undefined) {
    if (patch.blurMode === 'ramp' && next.blurEnd === undefined) next.blurEnd = BLUR_END_DEFAULT
    if (patch.blurMode === 'constant') delete next.blurEnd
    if (patch.blurEnd !== undefined && next.blurEnd !== undefined) next.blurEnd = round3(clamp(patch.blurEnd, 0, 1))
  }
  if (next.brightnessContrast && (patch.brightness !== undefined || patch.contrast !== undefined)) {
    next.brightnessContrast = {
      brightness: round3(clamp(patch.brightness ?? next.brightnessContrast.brightness, -1, 1)),
      contrast: round3(clamp(patch.contrast ?? next.brightnessContrast.contrast, -1, 1)),
    }
  }
  return next
}

/**
 * 영상 그림에 입힐 filter 글(모니터 CSS · 내보내기 캔버스) — 바뀌는 것이 없으면 undefined. frameWidthPx = 화면 틀 폭(흐림 반지름의 기준).
 *   blur = 그 시각 흐림 세기(그릴 것 목록 층의 blur). 시각 없이 부르면 흐림 칸(일정한 값 · [시작 → 끝]의 시작 값)으로 그린다 — 예전 Editor 와 같다.
 */
export function videoEffectFilter(effects: ClipEffects | undefined, frameWidthPx: number, blur: number | undefined = effects?.blur): string | undefined {
  if (!effects) return undefined
  const parts: string[] = []
  if (effects.blackWhite) parts.push('grayscale(1)')
  if (effects.blur !== undefined && blur && frameWidthPx > 0) parts.push(`blur(${Math.round(blur * BLUR_FULL_RATIO * frameWidthPx * 100) / 100}px)`)
  const bc = effects.brightnessContrast
  if (bc?.brightness) parts.push(`brightness(${round3(1 + bc.brightness)})`)
  if (bc?.contrast) parts.push(`contrast(${round3(1 + bc.contrast)})`)
  return parts.length > 0 ? parts.join(' ') : undefined
}
