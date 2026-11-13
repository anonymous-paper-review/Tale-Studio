// 실사 이미지 버전(디자이너 11/13 D6 · 오너 2026-11-14 답 5번 · 리드 A) — shots.storyboard_image JSON 안의 versions 목록.
//   만들 때마다 버전이 하나 쌓이고(v1 · v2 …), 위 칸(url · frames · generatedAt)은 고른 버전을 그대로 비춘다 — 카드 · 영상 시작 그림 ·
//   Editor · 내보내기는 지금처럼 위 칸만 읽는다. 1단계는 버전을 저절로 지우지 않는다(리드 답). 서버(완료 · 올리기 · 고르기)와 화면이 같이 쓰는 순수 규칙.
//   약속: tests/director/image-versions.test.ts
import type { StoryboardImage, StoryboardImageVersion } from '@/types/director'

const LEGACY_ID = 'legacy'

/** 버전 목록 — 버전 기록이 없는 옛 행은 지금 그림이 v1 이다. 그림이 없으면 빈 목록. */
export function storyboardImageVersions(image: StoryboardImage | null | undefined): StoryboardImageVersion[] {
  if (!image) return []
  if (image.versions?.length) return image.versions
  if (!image.url || image.status !== 'completed') return []
  return [{
    id: LEGACY_ID,
    n: 1,
    url: image.url,
    ...(image.frames ? { frames: image.frames } : {}),
    generatedAt: image.generatedAt,
    source: 'generated',
    ...(image.roughGeneratedAt !== undefined ? { roughGeneratedAt: image.roughGeneratedAt } : {}),
  }]
}

/** 지금 그림인 버전 — 고른 버전(versionId). 고른 적 없는 옛 모양이면 마지막 버전(옛 행은 v1)이되, 멈춘 뒤 끝난 버전은 고르지 않는다.
 *  versionId 가 null 이면 지금 그림이 없다(멈춘 그림만 있는 샷 — 리드 검토 a 보통 1). */
export function currentStoryboardVersion(image: StoryboardImage | null | undefined): StoryboardImageVersion | null {
  const versions = storyboardImageVersions(image)
  if (!image || !versions.length) return null
  if (typeof image.versionId === 'string') return versions.find((v) => v.id === image.versionId) ?? null
  if (image.versionId === null) return null
  return [...versions].reverse().find((v) => !v.cancelled) ?? null
}

function mirror(image: StoryboardImage | null, versions: StoryboardImageVersion[], chosen: StoryboardImageVersion): StoryboardImage {
  const { frames: _frames, stripUrl: _strip, roughGeneratedAt: _rough, ...rest } = image ?? ({} as Partial<StoryboardImage>)
  return {
    ...rest,
    url: chosen.url,
    ...(chosen.frames ? { frames: chosen.frames } : {}),
    status: 'completed',
    errorMessage: null,
    generatedAt: chosen.generatedAt,
    ...(chosen.roughGeneratedAt !== undefined ? { roughGeneratedAt: chosen.roughGeneratedAt } : {}),
    versions,
    versionId: chosen.id,
    rev: (image?.rev ?? 0) + 1,
  }
}

/** 새 버전을 쌓는다 — 같은 작업이 두 번 끝나면 그 버전을 고쳐 쓴다(하나만). select 면 그 버전이 지금 그림이 된다. */
export function withStoryboardVersion(
  image: StoryboardImage | null | undefined,
  version: Omit<StoryboardImageVersion, 'n'>,
  options: { select: boolean },
): StoryboardImage {
  const versions = [...storyboardImageVersions(image)]
  const at = versions.findIndex((v) => v.id === version.id)
  const n = at >= 0 ? versions[at]!.n : versions.reduce((max, v) => Math.max(max, v.n), 0) + 1
  const next: StoryboardImageVersion = { ...version, n }
  if (at >= 0) versions[at] = next
  else versions.push(next)
  if (options.select) return mirror(image ?? null, versions, next)
  // 고르지 않으면(멈춘 뒤 끝난 그림 · 오너 7번) 지금 그림은 그대로 — 목록과 차례만 바꾼다. 지금 그림이 없던 샷은 없는 채로 두어
  //   "이미지 필요"로 남고, 버전 줄에서 고르면 그때 지금 그림이 된다(리드 검토 a 보통 1).
  if (!image) return { url: '', status: 'pending', errorMessage: null, generatedAt: 0, versions, versionId: null, rev: 1 }
  return { ...image, versions, versionId: currentStoryboardVersion(image)?.id ?? null, rev: (image.rev ?? 0) + 1 }
}

/** 그 버전을 지금 그림으로 — 다시 만들지 않는다(Take 0). 없는 버전이면 null. */
export function selectStoryboardVersion(image: StoryboardImage | null | undefined, versionId: string): StoryboardImage | null {
  const versions = storyboardImageVersions(image)
  const chosen = versions.find((v) => v.id === versionId)
  if (!image || !chosen) return null
  return mirror(image, versions, chosen)
}

/** 만드는 중 · 실패 · 기다림 표시에도 지금 그림의 프레임 · 버전은 그대로 둔다 — 버전 줄과 끝 그림이 사라지지 않게(화면 상태 전용). */
export function keptStoryboardImage(image: StoryboardImage | null | undefined): Partial<StoryboardImage> {
  if (!image) return {}
  const versions = storyboardImageVersions(image)
  return {
    ...(image.frames ? { frames: image.frames } : {}),
    ...(versions.length ? { versions, versionId: currentStoryboardVersion(image)?.id ?? null } : {}),
    ...(typeof image.rev === 'number' ? { rev: image.rev } : {}),
  }
}

/** 주소 뒤 ?v= (캐시 깨기)는 같은 그림이다. */
function bareUrl(url: string | null | undefined): string | null {
  return url ? url.split('?')[0]! : null
}

/** Take 가 실제로 쓴 시작 · 끝 그림 주소로 그 버전 번호를 찾는다(리드 B — 작업 기록을 읽어서). 하나도 못 찾으면 null. */
export function versionOfFrames(
  image: StoryboardImage | null | undefined,
  used: { start?: string | null; end?: string | null } | null | undefined,
): { start: number | null; end: number | null } | null {
  if (!used) return null
  const versions = storyboardImageVersions(image)
  const find = (url: string | null, pick: (version: StoryboardImageVersion) => string | undefined) =>
    url ? versions.find((version) => bareUrl(pick(version)) === url)?.n ?? null : null
  const start = find(bareUrl(used.start), (version) => version.frames?.start ?? version.url)
  const end = find(bareUrl(used.end), (version) => version.frames?.end)
  return start === null && end === null ? null : { start, end }
}
