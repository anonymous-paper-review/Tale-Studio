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
