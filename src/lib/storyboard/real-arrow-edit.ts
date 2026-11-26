// 실사 가운데(연출) 장 화살표 고치기가 실사 시트(shots.storyboard_image)에 남는 모양(오너 2026-11-27 N4b · 리드 D1 · D2 = A) — 순수 규칙.
//   화살표 저장 = 새 판(id "arrows-…", source generated, 러프 시각은 밑 판 것)이 지금 그림 — 시작 · 끝은 밑 판 것 그대로, 가운데 장만 고친 장.
//     고치기 전 판은 지난 판으로 남아 [채택]으로 되돌린다(오너 11/14 답 5 "만들 때마다 쌓이고 저절로 지우지 않는다").
//   다시 그린 끝 장 = 그 판의 끝 장만 바꾼다(새 판을 만들지 않는다). 사람이 그새 다른 판을 골랐으면 그 판에만 넣고 지금 그림은 그대로.
//   읽은 줄(directionRead) · 밑층 캐시(cleanDirection) = 맨 위 새 칸 — 지금 가운데 장 주소의 것일 때만 산다(판을 바꾸면 저절로 낡는다, 마지막으로 고친 판 하나만).
//   서버(storyboard/real-directing-edit) · 화면(Storyboard 상세 · Director 팝업)이 같이 쓴다. 약속: tests/writer/real-arrow-versions.test.ts
import { currentStripFrames } from '@/lib/director/storyboard-image'
import { currentStoryboardVersion, storyboardImageVersions, withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { withEndDrawn, type DirectionRead } from '@/lib/writer/direction-read'
import type { StoryboardImage } from '@/types/director'
import type { RoughStoryboardImage } from '@/types/shot'

export type RealFrames = { start: string; direction: string; end: string }

/** 화살표를 고칠 수 있는 지금 그림의 세 장 — 완료 · 고른 판 · 세 장이 다 있을 때만(올린 한 장 · 옛 단일 그림 · 멈춘 그림만 있는 샷은 null). */
export function realEditFrames(image: unknown): RealFrames | null {
  return currentStripFrames(image)
}

function asImage(image: unknown): StoryboardImage | null {
  return image && typeof image === 'object' && !Array.isArray(image) ? (image as StoryboardImage) : null
}

/** 화살표를 저장한 새 판 — 지금 판의 시작 · 끝 그대로, 가운데 장만 고친 장. 지금 가운데 장이 화면이 고친 장(from)과 다르면 null(다른 판 위에 그린 것). */
export function withArrowVersion(
  image: unknown,
  edit: { id: string; direction: string; at: number; from: string },
): StoryboardImage | null {
  const img = asImage(image)
  const frames = realEditFrames(img)
  const base = currentStoryboardVersion(img)
  if (!img || !frames || !base || frames.direction !== edit.from) return null
  const next = withStoryboardVersion(
    img,
    {
      id: edit.id,
      url: base.url,
      frames: { ...frames, direction: edit.direction },
      generatedAt: edit.at,
      source: 'generated',
      ...(base.roughGeneratedAt !== undefined ? { roughGeneratedAt: base.roughGeneratedAt } : {}),
    },
    { select: true },
  )
  // 저장한 가운데 장은 밑그림이 같다 — 그 장의 밑층을 고친 장의 밑층으로 이어 쓴다(콘티 저장과 같은 규칙, 층 나누기에 그림 값이 다시 들지 않게).
  const clean = img.cleanDirection
  return clean?.url && clean.direction === edit.from ? { ...next, cleanDirection: { url: clean.url, direction: edit.direction } } : next
}

/** 실사 끝 장 작업이 그린 끝 장을 그 판에 넣는다 — 그 판이 없어졌거나 가운데 장이 바뀌었으면 null(끼우지 않는다).
 *  그 판이 지금 그림이면 맨 위 칸도 바꾸고, 아니면(그새 다른 판을 고름) 그 판에만 넣는다. 그 줄로 그렸다는 표시(directionRead.endDrawn)를 단다. */
export function withRealEndFrame(
  image: unknown,
  realEnd: { versionId: string; direction: string; line: string },
  endUrl: string,
): StoryboardImage | null {
  const img = asImage(image)
  if (!img) return null
  const versions = storyboardImageVersions(img)
  const at = versions.findIndex((version) => version.id === realEnd.versionId)
  const version = at >= 0 ? versions[at]! : null
  if (!version?.frames || version.frames.direction !== realEnd.direction) return null
  const drawn = { ...version, frames: { ...version.frames, end: endUrl } }
  const isCurrent = currentStoryboardVersion(img)?.id === realEnd.versionId
  const next: StoryboardImage = {
    ...img,
    versions: versions.map((item, i) => (i === at ? drawn : item)),
    ...(isCurrent ? { frames: drawn.frames } : {}),
    rev: (img.rev ?? 0) + 1,
  }
  if (img.directionRead !== undefined) {
    next.directionRead = withEndDrawn(img.directionRead, { en: realEnd.line, direction: realEnd.direction }, endUrl) as DirectionRead
  }
  return next
}

/** 읽은 줄을 남긴다 — 지금 가운데 장의 줄이 아니면(그새 다른 판 · 다시 그림) null. */
export function withRealDirectionRead(image: unknown, read: DirectionRead): StoryboardImage | null {
  const img = asImage(image)
  const frames = realEditFrames(img)
  if (!img || !frames || frames.direction !== read.direction) return null
  return { ...img, directionRead: read, rev: (img.rev ?? 0) + 1 }
}

/** 밑층 캐시를 남긴다 — 밑층을 만든 가운데 장(from)이 지금 가운데 장이 아니면 null(낡은 밑층). */
export function withRealCleanPlate(image: unknown, from: string, url: string): StoryboardImage | null {
  const img = asImage(image)
  const frames = realEditFrames(img)
  if (!img || !frames || frames.direction !== from) return null
  return { ...img, cleanDirection: { url, direction: from }, rev: (img.rev ?? 0) + 1 }
}

/** 편집기(콘티 러프 모양을 받는다)에 넘길 실사 — 지금 그림의 세 장, 지금 가운데 장의 밑층(그림 시각에 묶어 바로 쓰게), 읽은 줄(낡음은 편집기가 가린다).
 *  세 장이 없으면 null. */
export function realEditorPanel(image: unknown): (RoughStoryboardImage & { directionRead?: unknown }) | null {
  const img = asImage(image)
  const frames = realEditFrames(img)
  if (!img || !frames) return null
  const generatedAt = typeof img.generatedAt === 'number' ? img.generatedAt : 0
  const clean = img.cleanDirection
  return {
    url: frames.start,
    status: 'completed',
    errorMessage: null,
    generatedAt,
    frames,
    ...(clean?.url && clean.direction === frames.direction ? { cleanDirection: { url: clean.url, for: generatedAt } } : {}),
    ...(img.directionRead !== undefined ? { directionRead: img.directionRead } : {}),
  }
}

/** 상세의 [화살표 고치기] — 지금 그림이 세 장 실사일 때만 보이고(지난 판을 보는 동안은 아님), 그 샷을 그리는 중이면 잠근다. */
export function realArrowEntry(input: { image: unknown; viewingPast: boolean; drawing: boolean }): { show: boolean; locked: boolean } {
  return { show: !input.viewingPast && !!realEditFrames(input.image), locked: input.drawing }
}
