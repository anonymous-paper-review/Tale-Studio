// 영상 참조 프레임의 서버 판정(Director 배선 5, 2026-09-06 — #ref-gate 와 같은 방향).
//
// 왜: 게이트(#ref-gate)는 DB 의 실사 스토리보드를 보지만, 제출되는 프레임은 클라 로컬 노드 값이었다.
//   스토어가 낡으면(다른 기기에서 생성, 탭 복귀 전) 이미지 없이 T2V 로 나가거나 옛 프레임이 실렸다.
// 규칙:
//   - auto(사람이 프레임을 배선하지 않음): DB 실사가 있으면 시작·끝 프레임을 DB 로 정한다. 클라 값은 무시.
//   - manual(손으로 배선한 프레임·영상 체인): 클라 목록을 존중하되, 시작 프레임이 없으면 DB 시작 프레임을 앞에 채운다.
//   - DB 실사가 없으면(독립 영상·미생성) 클라 값을 그대로 둔다 — 게이트가 이미 막았거나 막을 대상이 아니다.
//   - frameSource 가 없는 호출(구 클라·직접 호출)은 종전대로 클라 값을 쓴다 — 새 클라는 항상 보낸다.
import { storyboardImageEndFrame, storyboardImageStartFrame } from '@/lib/director/storyboard-image'

export type VideoFrameSource = 'manual' | 'auto'
export type VideoReferenceRole = 'start' | 'end' | 'ref'

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

/** 한 요청이 그림을 몇 장까지 받나 — 모델별 상한(최대 9)보다 넉넉하게 둔다. 넘으면 참고 그림만 뒤에서부터 덜어 받는다. */
export const MAX_REQUEST_REFERENCE_IMAGES = 12

export interface ClampedReferenceImages {
  urls: string[]
  roles: VideoReferenceRole[] | undefined
  /** 덜어 낸 그림 수 — 화면이 "N장은 이 모델이 받지 않아 뺐어요"를 보일 근거. */
  dropped: number
}

/**
 * 그림 목록을 max 장 안으로 줄인다(방안 고장 1, 2026-11-22). 예전에는 앞 4장만 남겨 끝 그림이 빠졌다.
 *   - 역할이 있으면: 시작 · 끝 등 장면 역할은 남기고 참고 그림(ref)만 뒤에서부터 덜어 낸다.
 *   - 역할이 없는 옛 목록: 옛 규약("첫 = 시작, 마지막 = 끝")대로 첫 · 마지막을 남기고 그 사이를 뒤에서부터 덜어 낸다.
 *   - uncounted: image_urls 밖의 칸으로 가는 역할(예: 첫 · 끝 장면 칸이 따로 있는 모델의 시작 · 끝)은 세지 않는다.
 */
export function clampReferenceImages(
  urls: string[],
  roles: VideoReferenceRole[] | undefined,
  max: number,
  uncounted: ReadonlySet<VideoReferenceRole> = new Set(),
): ClampedReferenceImages {
  const limit = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1
  if (roles && roles.length === urls.length) {
    let counted = roles.filter((role) => !uncounted.has(role)).length
    if (counted <= limit) return { urls, roles, dropped: 0 }
    const keep = urls.map(() => true)
    for (let i = urls.length - 1; i >= 0 && counted > limit; i -= 1) {
      if (roles[i] === 'ref' && !uncounted.has('ref')) {
        keep[i] = false
        counted -= 1
      }
    }
    const keptUrls = urls.filter((_, i) => keep[i])
    return { urls: keptUrls, roles: roles.filter((_, i) => keep[i]), dropped: urls.length - keptUrls.length }
  }
  if (urls.length <= limit) return { urls, roles: undefined, dropped: 0 }
  const kept = limit === 1 ? [urls[0]!] : [...urls.slice(0, limit - 1), urls[urls.length - 1]!]
  return { urls: kept, roles: undefined, dropped: urls.length - kept.length }
}

export function resolveVideoReferenceFrames(input: VideoReferenceFramesInput): VideoReferenceFrames {
  const clientUrls = (input.referenceImageUrls ?? []).filter((u) => typeof u === 'string' && !!u.trim())
  const clientRoles =
    input.referenceImageRoles && input.referenceImageRoles.length === clientUrls.length
      ? input.referenceImageRoles
      : undefined
  const asClient = (): VideoReferenceFrames => {
    const primary = input.referenceImageUrl?.trim() || clientUrls[0] || null
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
  const dbEnd = storyboardImageEndFrame(input.storyboardImage)

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
    referenceImageUrls: dbEnd ? [dbStart, dbEnd] : [dbStart],
    referenceImageRoles: dbEnd ? ['start', 'end'] : ['start'],
    source: 'db',
  }
}
