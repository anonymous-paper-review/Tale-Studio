// 서버는 사용자가 고른 그림을 그대로 써서 영상을 만든다
//
// 일괄 이어가기(#batch-resume)의 전제. 서버가 브라우저 없이 다음 영상을 제출하려면, 사람이 배선한
// 프레임을 서버가 DB 에서 그대로 복원할 수 있어야 한다. 못 하면 다른 그림으로 영상이 나가고
// Take 만 나간다 — 그 경우 그 샷은 일괄에서 빼야 한다.
//
// 배선은 video_clips.frame_inputs / video_chain 에 저장된다(#wiring-persistence 2026-08-31).
// 다만 그 마이그레이션 주석이 밝힌 의도된 한계가 있다: videoClipId 없는 미생성 테이크는 DB 행이
// 없어 참조 대상이 될 수 없다. 그런 배선은 브라우저에만 남으므로 서버가 이어받을 수 없다.
import { describe, expect, it } from 'vitest'
import { resolveVideoReferenceFrames } from '@/lib/director/video-reference-frames'

const DB_START = 'https://cdn/storyboard-start.png'
const DB_END = 'https://cdn/storyboard-end.png'

function storyboard() {
  return {
    status: 'completed' as const,
    url: DB_START,
    frames: { start: DB_START, end: DB_END },
  }
}

describe('서버가 정하는 참조 프레임', () => {
  it('배선하지 않은 샷은 서버가 DB 그림으로 정한다', () => {
    // 일괄의 대부분이 이 경우다 — 브라우저가 없어도 같은 결과가 나온다.
    const frames = resolveVideoReferenceFrames({
      frameSource: 'auto',
      referenceImageUrl: undefined,
      referenceImageUrls: [],
      referenceImageRoles: undefined,
      storyboardImage: storyboard(),
    })

    expect(frames.referenceImageUrl).toBe(DB_START)
    expect(frames.generationMethod).toBe('I2V')
    expect(frames.source).toBe('db')
  })

  it('브라우저가 낡은 그림을 보내도 DB 그림을 쓴다', () => {
    // 서버가 진실이다. 스토어가 낡아도 옛 프레임이 실리지 않는다(#Director 배선 5).
    const frames = resolveVideoReferenceFrames({
      frameSource: 'auto',
      referenceImageUrl: 'https://cdn/stale.png',
      referenceImageUrls: ['https://cdn/stale.png'],
      referenceImageRoles: undefined,
      storyboardImage: storyboard(),
    })

    expect(frames.referenceImageUrl).toBe(DB_START)
  })

  it('사람이 배선한 그림은 그대로 존중한다', () => {
    // 사용자가 START 로 지정한 그림이 있으면 서버가 덮지 않는다.
    const chosen = 'https://cdn/user-picked.png'
    const frames = resolveVideoReferenceFrames({
      frameSource: 'manual',
      referenceImageUrl: chosen,
      referenceImageUrls: [chosen],
      referenceImageRoles: ['start'],
      storyboardImage: storyboard(),
    })

    expect(frames.referenceImageUrl).toBe(chosen)
  })

  it('배선에 시작 그림이 없으면 DB 시작 그림을 앞에 채운다', () => {
    // 참조만 배선한 경우 — 사용자 선택을 지우지 않고 시작 프레임만 보탠다.
    const ref = 'https://cdn/user-ref.png'
    const frames = resolveVideoReferenceFrames({
      frameSource: 'manual',
      referenceImageUrl: ref,
      referenceImageUrls: [ref],
      referenceImageRoles: ['ref'],
      storyboardImage: storyboard(),
    })

    expect(frames.referenceImageUrl).toBe(DB_START)
    expect(frames.referenceImageUrls).toEqual([DB_START, ref])
    expect(frames.referenceImageRoles).toEqual(['start', 'ref'])
  })

  it('DB 에 그림이 없으면 브라우저가 보낸 것을 쓴다', () => {
    // 서버가 이어받을 근거가 없는 경우 — 일괄에서 이 샷을 빼야 한다는 신호다.
    const only = 'https://cdn/client-only.png'
    const frames = resolveVideoReferenceFrames({
      frameSource: 'auto',
      referenceImageUrl: only,
      referenceImageUrls: [only],
      referenceImageRoles: undefined,
      storyboardImage: null,
    })

    expect(frames.referenceImageUrl).toBe(only)
    expect(frames.source).toBe('client')
  })
})
