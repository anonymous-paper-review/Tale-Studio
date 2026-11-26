// 영상 참조 프레임의 서버 판정(Director 배선 5, 2026-09-06 — #ref-gate 와 같은 방향).
//
// 왜: 게이트(#ref-gate)는 DB 의 실사 스토리보드를 보지만, 제출되는 프레임은 클라 로컬 노드 값이었다.
//   스토어가 낡으면(다른 기기에서 생성, 탭 복귀 전) 이미지 없이 T2V 로 나가거나 옛 프레임이 실렸다.
// 규칙:
//   - auto(사람이 프레임을 배선하지 않음): DB 실사가 있으면 시작 프레임을 DB 로 정한다. 클라 값은 무시.
//     (샷 영상의 'auto' 요청은 이제 방식 길 — 기본 시작+프롬프트 — 로 가서 여기를 거의 지나지 않는다, 2026-11-27 N4a.)
//   - manual(손으로 배선한 프레임·영상 체인): 클라 목록을 존중하되, 시작 프레임이 없으면 DB 시작 프레임을 앞에 채운다.
//   - DB 실사가 없으면(독립 영상·미생성) 클라 값을 그대로 둔다 — 게이트가 이미 막았거나 막을 대상이 아니다.
//   - frameSource 가 없는 호출(구 클라·직접 호출)은 종전대로 클라 값을 쓴다 — 새 클라는 항상 보낸다.
//   - 끝 그림은 어느 경우에도 싣지 않는다(오너 dev 때 "Start, End 프레임 생성 방식은 일단 폐기") — 클라 목록의 끝 역할은 빼고,
//     역할 없는 옛 목록은 옛 약속(첫 = 시작, 마지막 = 끝)대로 읽어 마지막 그림을 뺀다. 거절하지는 않는다(옛 캔버스의 끝 배선).
import { storyboardImageStartFrame } from '@/lib/director/storyboard-image'

export type VideoFrameSource = 'manual' | 'auto'
/** 'direction' = ③ 시작+미들의 미들(연출 · 의도 — 실사 가운데 장, 2026-11-27 N4a) — 서버가 방식대로 고를 때만 생긴다(화면은 보내지 않는다). */
export type VideoReferenceRole = 'start' | 'end' | 'ref' | 'direction'

export interface VideoReferenceFramesInput {
  frameSource: VideoFrameSource | undefined
  referenceImageUrl: string | undefined
  referenceImageUrls: string[] | undefined
  referenceImageRoles: VideoReferenceRole[] | undefined
  /** shots.storyboard_image (JSONB) — 독립 영상은 null. */
  storyboardImage: unknown
}

export interface VideoReferenceFrames {
  generationMethod: 'I2V' | 'T2V'
  referenceImageUrl: string | null
  referenceImageUrls: string[] | undefined
  referenceImageRoles: VideoReferenceRole[] | undefined
  /** 어느 쪽이 프레임을 정했는가 — 잡 기록·테스트용. */
  source: 'db' | 'client'
}

/**
 * 끝 그림 빼기(오너 dev 때 시작+끝 폐기) — 역할이 있으면 끝 역할을 뺀다. 역할 없는 옛 목록은 옛 약속(첫 = 시작, 마지막 = 끝)대로
 *   두 장 이상이면 마지막 그림을 빼고 첫 그림을 시작 · 사이 그림을 참고로 적는다(한 장이면 지금처럼 역할 없이 둔다).
 */
export function withoutEndFrames(
  urls: readonly string[],
  roles: readonly VideoReferenceRole[] | undefined,
): { urls: string[]; roles: VideoReferenceRole[] | undefined; droppedEnds: string[] } {
  if (roles && roles.length === urls.length) {
    const keep = urls.map((_, index) => index).filter((index) => roles[index] !== 'end')
    const kept = keep.map((index) => urls[index]!)
    return { urls: kept, roles: keep.map((index) => roles[index]!), droppedEnds: urls.filter((url, index) => roles[index] === 'end' && !kept.includes(url)) }
  }
  if (urls.length < 2) return { urls: [...urls], roles: undefined, droppedEnds: [] }
  const kept = urls.slice(0, -1)
  const last = urls[urls.length - 1]!
  return { urls: kept, roles: kept.map((_, index): VideoReferenceRole => (index === 0 ? 'start' : 'ref')), droppedEnds: kept.includes(last) ? [] : [last] }
}

/**
 * 그림 목록을 max 장 안으로 줄인다 — 참고 그림(ref)만 뒤에서부터 덜어 내고 시작 · 미들 등 장면 역할은 남긴다(dev 방안 고장 1 과 같은 규칙).
 *   지금은 ② 레퍼런스(서버가 고른 목록)에만 쓴다. keptIndices = 남긴 그림의 원래 자리(그림 이름을 같이 덜어 낼 때).
 */
export function clampReferenceImages(
  urls: readonly string[],
  roles: readonly VideoReferenceRole[],
  max: number,
): { urls: string[]; roles: VideoReferenceRole[]; dropped: number; keptIndices: number[] } {
  const limit = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1
  const keep = urls.map(() => true)
  let count = urls.length
  for (let i = urls.length - 1; i >= 0 && count > limit; i -= 1) {
    if (roles[i] === 'ref') {
      keep[i] = false
      count -= 1
    }
  }
  const keptIndices = urls.map((_, i) => i).filter((i) => keep[i])
  return { urls: keptIndices.map((i) => urls[i]!), roles: keptIndices.map((i) => roles[i]!), dropped: urls.length - keptIndices.length, keptIndices }
}

export function resolveVideoReferenceFrames(input: VideoReferenceFramesInput): VideoReferenceFrames {
  const sentUrls = (input.referenceImageUrls ?? []).filter((u) => typeof u === 'string' && !!u.trim())
  const sentRoles =
    input.referenceImageRoles && input.referenceImageRoles.length === sentUrls.length
      ? input.referenceImageRoles
      : undefined
  const { urls: clientUrls, roles: clientRoles, droppedEnds } = withoutEndFrames(sentUrls, sentRoles)
  const asClient = (): VideoReferenceFrames => {
    // 화면이 따로 보낸 한 장(referenceImageUrl)이 뺀 끝 그림이면 그것도 쓰지 않는다(끝만 이은 옛 배선).
    const single = input.referenceImageUrl?.trim()
    const primary = (single && !droppedEnds.includes(single) ? single : null) || clientUrls[0] || null
    return {
      generationMethod: primary ? 'I2V' : 'T2V',
      referenceImageUrl: primary,
      referenceImageUrls: clientUrls.length ? clientUrls : undefined,
      referenceImageRoles: clientUrls.length ? clientRoles : undefined,
      source: 'client',
    }
  }
  if (input.frameSource === undefined) return asClient()
  const dbStart = storyboardImageStartFrame(input.storyboardImage)
  if (!dbStart) return asClient()

  if (input.frameSource === 'manual' && clientUrls.length > 0) {
    const roles = clientRoles ?? clientUrls.map((): VideoReferenceRole => 'ref')
    if (roles.includes('start')) return asClient()
    return {
      generationMethod: 'I2V',
      referenceImageUrl: dbStart,
      referenceImageUrls: [dbStart, ...clientUrls],
      referenceImageRoles: ['start', ...roles],
      source: 'client',
    }
  }

  return {
    generationMethod: 'I2V',
    referenceImageUrl: dbStart,
    referenceImageUrls: [dbStart],
    referenceImageRoles: ['start'],
    source: 'db',
  }
}
