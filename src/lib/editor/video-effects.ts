// 영상 효과(2단계 ⑤, 시안 E2 409:5334–5346) — 흑백 · 가우시안 흐림 · 밝기 및 대비. 클립마다 넣은 효과만 칸이 있다(VideoClip.effects).
//   모니터는 영상 그림에 CSS filter 로 입힌다(videoEffectFilter) — 내보낸 영상에는 ⑦에서 같은 글을 캔버스 filter 에 싣는다.
//   타이틀 카드에는 넣지 않는다. 약속: tests/editor/transitions-effects.test.ts
import type { ClipEffects, VideoClip } from '@/types/shot'

export type VideoEffectKind = keyof ClipEffects

/** 효과 탭 · 효과 컨트롤의 차례(시안 E2 409:5337–5345). */
export const VIDEO_EFFECTS: readonly VideoEffectKind[] = ['blackWhite', 'blur', 'brightnessContrast']
/** 화면 이름 — 영어는 프리미어 이름, 한국어는 사전(오너 결정 4). */
export const VIDEO_EFFECT_LABEL: Record<VideoEffectKind, string> = {
  blackWhite: 'Black & White',
  blur: 'Gaussian blur',
  brightnessContrast: 'Brightness & Contrast',
}
/** 넣자마자의 값 — 흑백 켬, 흐림 30%(넣자마자 보이게), 밝기 · 대비 0%(프리미어와 같다). */
export const VIDEO_EFFECT_DEFAULT: Required<ClipEffects> = {
  blackWhite: true,
  blur: 0.3,
  brightnessContrast: { brightness: 0, contrast: 0 },
}
/** 흐림 100% = 화면 틀 폭의 4% 반지름 — 모니터 크기가 바뀌어도 같은 흐림이다. */
const BLUR_FULL_RATIO = 0.04

/** 효과 컨트롤에서 바꾸는 값 — 그 효과를 넣은 클립에만 들어간다. */
export interface VideoEffectPatch {
  blackWhite?: boolean
  blur?: number
  brightness?: number
  contrast?: number
}

const round3 = (n: number) => Math.round(n * 1000) / 1000
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0))

export function hasVideoEffects(clip: Pick<VideoClip, 'effects'> | undefined): boolean {
  return !!clip?.effects && Object.keys(clip.effects).length > 0
}

/** 넣은 효과에만 값을 바꾼다 — 흐림 0 ~ 1, 밝기 · 대비 −1 ~ 1. 없는 효과는 더하지 않는다. */
export function patchEffects(effects: ClipEffects, patch: VideoEffectPatch): ClipEffects {
  const next: ClipEffects = { ...effects }
  if (patch.blackWhite !== undefined && next.blackWhite !== undefined) next.blackWhite = patch.blackWhite
  if (patch.blur !== undefined && next.blur !== undefined) next.blur = round3(clamp(patch.blur, 0, 1))
  if (next.brightnessContrast && (patch.brightness !== undefined || patch.contrast !== undefined)) {
    next.brightnessContrast = {
      brightness: round3(clamp(patch.brightness ?? next.brightnessContrast.brightness, -1, 1)),
      contrast: round3(clamp(patch.contrast ?? next.brightnessContrast.contrast, -1, 1)),
    }
  }
  return next
}

/** 모니터 영상 그림에 입힐 CSS filter — 바뀌는 것이 없으면 undefined. frameWidthPx = 화면 틀 폭(흐림 반지름의 기준). */
export function videoEffectFilter(effects: ClipEffects | undefined, frameWidthPx: number): string | undefined {
  if (!effects) return undefined
  const parts: string[] = []
  if (effects.blackWhite) parts.push('grayscale(1)')
  if (effects.blur && frameWidthPx > 0) parts.push(`blur(${Math.round(effects.blur * BLUR_FULL_RATIO * frameWidthPx * 100) / 100}px)`)
  const bc = effects.brightnessContrast
  if (bc?.brightness) parts.push(`brightness(${round3(1 + bc.brightness)})`)
  if (bc?.contrast) parts.push(`contrast(${round3(1 + bc.contrast)})`)
  return parts.length > 0 ? parts.join(' ') : undefined
}
