// 영상 만드는 방식마다 어떤 그림을 어떤 순서 · 역할로 보내나(오너 2026-11-22 D2~D5 · 같은 날 밤 시작+끝 폐기) — 순수 함수.
//   서버(video-submit)가 DB 값으로 부르고, 화면(Camera)이 같은 함수로 방식을 끈다. 끝 그림 · 러프(목각 인형) 그림은 어느 방식에서도 보내지 않는다.
//
//   start_prompt : [실사 시작]                       역할 start          — 기본. 실사 끝이 있어도 보내지 않는다
//   start_middle : [실사 시작, 미들]                 역할 start, direction — 미들 = 실사 시트의 가운데 장(V2). 러프를 고친 뒤 다시 그리지 않은 실사면 막는다
//   continue     : [이어 붙일 장면]                  역할 start          — 이어 붙일 장면은 서버가 출처를 확인한 뒤 넘긴다. 이번 샷의 끝은 보내지 않는다
//   reference    : [샷 실사?, 인물 시트…, 배경?, 소품…] 역할 전부 ref    — 순서가 곧 덜어 내는 순서의 반대(뒤에서부터 덜어 낸다)
import { storyboardImageStartFrame } from '@/lib/director/storyboard-image'
import { classifyRoughChanged } from '@/lib/image-provenance'
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

export type ModeFramesError = 'missing_storyboard' | 'missing_middle_frame' | 'middle_outdated' | 'missing_reference_images' | 'missing_continue_frame'

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

/**
 * ③ 의 실사 미들이 낡았나 — 실사를 그린 뒤 러프(화살표 편집 · 끝 장 다시 그리기 포함)가 바뀌었으면("러프 바뀜", classifyRoughChanged)
 *   실사 가운데 장은 고치기 전 움직임이고 영상 지시의 읽은 줄은 고친 뒤 움직임이다(리드 D1 2026-11-22). 기록이 없는 옛 실사는 낡았다고 보지 않는다.
 */
export function realMiddleOutdated(storyboardImage: unknown, roughStoryboard: unknown): boolean {
  const record = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null)
  const image = record(storyboardImage)
  const rough = record(roughStoryboard)
  if (!image || !rough) return false
  return classifyRoughChanged(
    { generatedAt: typeof rough.generatedAt === 'number' ? rough.generatedAt : null, status: typeof rough.status === 'string' ? rough.status : undefined },
    { roughGeneratedAt: typeof image.roughGeneratedAt === 'number' ? image.roughGeneratedAt : null, status: typeof image.status === 'string' ? image.status : undefined },
  )
}

const ROUGH_FILE_NAME = /_rough_(start|direction|end|storyboard)\.[a-z0-9]+$/i

/**
 * 러프(목각 인형) 그림 주소인가(오너 2026-11-22 "영상 생성에는 무조건 실사 그림만") — 그 샷 러프 기록의 그림(주소 뒤 ?v= 는 빼고 견준다)이거나,
 *   우리 보관함의 러프 파일 이름(<샷>_rough_start · _rough_direction · _rough_end · _rough_storyboard, src/lib/fal/finalize.ts)이다.
 */
export function isRoughImageUrl(url: string, roughStoryboard?: unknown): boolean {
  const bare = url.split(/[?#]/)[0] ?? ''
  let path = bare
  try {
    path = new URL(bare).pathname
  } catch {
    // 주소 꼴이 아니면 글 그대로 본다.
  }
  if (ROUGH_FILE_NAME.test(path)) return true
  const rough = roughStoryboard && typeof roughStoryboard === 'object' && !Array.isArray(roughStoryboard) ? (roughStoryboard as Record<string, unknown>) : null
  const frames = rough?.frames && typeof rough.frames === 'object' ? Object.values(rough.frames as Record<string, unknown>) : []
  return [...frames, rough?.url].some((frame) => typeof frame === 'string' && !!frame && frame.split(/[?#]/)[0] === bare)
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
  if (!start) return { ok: false, code: 'missing_storyboard' }
  const frames = (urls: string[], roles: VideoReferenceRole[], extra: Partial<{ labels: string[]; middleSource: StartMiddleSource }> = {}): ModeFramesResult => ({
    ok: true,
    urls,
    roles,
    labels: extra.labels ?? null,
    middleSource: extra.middleSource ?? null,
  })
  switch (input.mode) {
    case 'start_prompt':
      return frames([start], ['start'])
    case 'start_middle': {
      const source = input.middleSource ?? START_MIDDLE_SOURCE
      const middle = source === 'real' ? realMiddleFrame(input.storyboardImage) : roughMiddleFrame(input.roughStoryboard)
      if (!middle) return { ok: false, code: 'missing_middle_frame' }
      if (source === 'real' && realMiddleOutdated(input.storyboardImage, input.roughStoryboard)) return { ok: false, code: 'middle_outdated' }
      return frames([start, middle], ['start', 'direction'], { middleSource: source })
    }
    case 'continue': {
      const frame = input.continueFrameUrl?.trim()
      if (!frame) return { ok: false, code: 'missing_continue_frame' }
      return frames([frame], ['start'])
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
