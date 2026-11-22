// 영상 만드는 방식마다 어떤 그림을 어떤 순서 · 역할로 보내나(오너 2026-11-22 D2~D5) — 순수 함수. 서버(video-submit)가 DB 값으로 부른다.
//
//   start_end    : [실사 시작, 실사 끝?]            역할 start, end
//   start_prompt : [실사 시작]                       역할 start          — 끝은 있어도 보내지 않는다
//   start_middle : [실사 시작, 미들]                 역할 start, direction — 미들 = 러프 미들(기본) 또는 실사 미들(START_MIDDLE_SOURCE)
//   continue     : [이어 붙일 장면, 실사 끝?]        역할 start, end     — 이어 붙일 장면은 서버가 출처를 확인한 뒤 넘긴다
//   reference    : [샷 실사?, 인물 시트…, 배경?, 소품…] 역할 전부 ref    — 순서가 곧 덜어 내는 순서의 반대(뒤에서부터 덜어 낸다)
import { storyboardImageEndFrame, storyboardImageStartFrame } from '@/lib/director/storyboard-image'
import type { VideoReferenceRole } from '@/lib/director/video-reference-frames'
import {
  REFERENCE_INCLUDES_SHOT_IMAGE,
  START_MIDDLE_SOURCE,
  type StartMiddleSource,
  type VideoMode,
} from '@/lib/director/video-modes'

export interface LabeledImage {
  url: string
  /** 모델에 그 그림이 무엇인지 적는 이름(영어 글) — 예: "character sheet: Mina". */
  label: string
}

/** ② 레퍼런스의 재료 — 인물 시트(인물 순) · 배경 · 소품. 소품은 fb-artist 의 샷별 소품 그림이 들어오기 전까지 빈 목록이다. */
export interface ModeReferenceSet {
  characters: LabeledImage[]
  world: LabeledImage | null
  props: LabeledImage[]
}

export type ModeFramesError = 'missing_storyboard' | 'missing_middle_frame' | 'missing_reference_images' | 'missing_continue_frame'

export type ModeFramesResult =
  | { ok: true; urls: string[]; roles: VideoReferenceRole[]; labels: string[] | null; middleSource: StartMiddleSource | null }
  | { ok: false; code: ModeFramesError }

export const SHOT_REFERENCE_LABEL = "this shot's storyboard frame (composition and look, not the first frame)"

/** 러프 미들(shots.rough_storyboard.frames.direction) — 화살표 편집기가 같은 주소에 덮어 저장하므로 고친 시각(generatedAt)을 붙인다. */
export function roughMiddleFrame(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rough = raw as { status?: unknown; generatedAt?: unknown; frames?: { direction?: unknown } | null }
  if (rough.status !== 'completed') return null
  const direction = typeof rough.frames?.direction === 'string' ? rough.frames.direction.trim() : ''
  if (!direction) return null
  const v = typeof rough.generatedAt === 'number' && Number.isFinite(rough.generatedAt) ? rough.generatedAt : null
  return v ? `${direction}${direction.includes('?') ? '&' : '?'}v=${v}` : direction
}

/** 실사 미들(shots.storyboard_image.frames.direction) — 실사 시트의 가운데 장(시작 그림 + 화살표 · 글자). */
export function realMiddleFrame(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const image = raw as { status?: unknown; frames?: { direction?: unknown } | null }
  if (typeof image.status === 'string' && image.status !== 'completed') return null
  const direction = typeof image.frames?.direction === 'string' ? image.frames.direction.trim() : ''
  return direction || null
}

export function resolveModeFrames(input: {
  mode: VideoMode
  storyboardImage: unknown
  roughStoryboard?: unknown
  /** ① 서버가 출처를 확인한 이어 붙일 장면 주소. */
  continueFrameUrl?: string | null
  references?: ModeReferenceSet | null
  middleSource?: StartMiddleSource
  includeShotImage?: boolean
}): ModeFramesResult {
  const start = storyboardImageStartFrame(input.storyboardImage)
  const end = storyboardImageEndFrame(input.storyboardImage)
  if (!start) return { ok: false, code: 'missing_storyboard' }
  const frames = (urls: string[], roles: VideoReferenceRole[], extra: Partial<{ labels: string[]; middleSource: StartMiddleSource }> = {}): ModeFramesResult => ({
    ok: true,
    urls,
    roles,
    labels: extra.labels ?? null,
    middleSource: extra.middleSource ?? null,
  })
  switch (input.mode) {
    case 'start_end':
      return end ? frames([start, end], ['start', 'end']) : frames([start], ['start'])
    case 'start_prompt':
      return frames([start], ['start'])
    case 'start_middle': {
      const source = input.middleSource ?? START_MIDDLE_SOURCE
      const middle = source === 'real' ? realMiddleFrame(input.storyboardImage) : roughMiddleFrame(input.roughStoryboard)
      if (!middle) return { ok: false, code: 'missing_middle_frame' }
      return frames([start, middle], ['start', 'direction'], { middleSource: source })
    }
    case 'continue': {
      const frame = input.continueFrameUrl?.trim()
      if (!frame) return { ok: false, code: 'missing_continue_frame' }
      return end ? frames([frame, end], ['start', 'end']) : frames([frame], ['start'])
    }
    case 'reference': {
      const refs = input.references ?? { characters: [], world: null, props: [] }
      const images: LabeledImage[] = [
        ...((input.includeShotImage ?? REFERENCE_INCLUDES_SHOT_IMAGE) ? [{ url: start, label: SHOT_REFERENCE_LABEL }] : []),
        ...refs.characters,
        ...(refs.world ? [refs.world] : []),
        ...refs.props,
      ]
      if (!images.length) return { ok: false, code: 'missing_reference_images' }
      return frames(images.map((image) => image.url), images.map((): VideoReferenceRole => 'ref'), { labels: images.map((image) => image.label) })
    }
  }
}
