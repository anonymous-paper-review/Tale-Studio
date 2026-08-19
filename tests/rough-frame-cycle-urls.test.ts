import { describe, it, expect } from 'vitest'
import { cycleFrameUrls, withCacheBust } from '@/components/rough-frame-cycle'
import { toThumbUrl } from '@/lib/image-url'
import { mediaPublicUrl } from '@/lib/storage/media-url'

// 3프레임 순환(RoughFrameCycle)의 주소 목록 계산 — 컴포넌트에서 분리한 순수 함수.
// 화면 렌더는 자동 시험이 없으므로(브라우저 없는 환경), "세 프레임이 전부 썸네일 주소가
// 될 수 있는가"를 이 함수 + toThumbUrl 조합으로 잠근다.

const START = mediaPublicUrl('ws/proj/shots/s1_rough_start.png')
const DIRECTION = mediaPublicUrl('ws/proj/shots/s1_rough_direction.png')
const END = mediaPublicUrl('ws/proj/shots/s1_rough_end.png')

describe('cycleFrameUrls', () => {
  it('frames가 있으면 start→direction→end 3장, 캐시버스트 쿼리 포함', () => {
    const urls = cycleFrameUrls({
      url: START,
      generatedAt: 1755000000000,
      frames: { start: START, direction: DIRECTION, end: END },
    })
    expect(urls).toEqual([
      `${START}?v=1755000000000`,
      `${DIRECTION}?v=1755000000000`,
      `${END}?v=1755000000000`,
    ])
  })

  it('frames가 없는 구버전 패널은 단일 주소로 떨어진다', () => {
    // generatedAt 은 RoughStoryboardImage 의 필수 필드다 — 없는 상태를 시험하면
    // 일어날 수 없는 경우를 잠그게 된다. 구버전을 가르는 것은 frames 유무뿐이다.
    const urls = cycleFrameUrls({ url: START, generatedAt: 1755000000000, frames: undefined })
    expect(urls).toEqual([`${START}?v=1755000000000`])
  })

  it('세 프레임 전부 썸네일 주소가 되고 ?v= 쿼리가 보존된다 (ThumbImage 경유 계약)', () => {
    const urls = cycleFrameUrls({
      url: START,
      generatedAt: 1755000000000,
      frames: { start: START, direction: DIRECTION, end: END },
    })
    const thumbs = urls.map(toThumbUrl)
    expect(thumbs).toEqual([
      `${mediaPublicUrl('ws/proj/shots/s1_rough_start_thumb.webp')}?v=1755000000000`,
      `${mediaPublicUrl('ws/proj/shots/s1_rough_direction_thumb.webp')}?v=1755000000000`,
      `${mediaPublicUrl('ws/proj/shots/s1_rough_end_thumb.webp')}?v=1755000000000`,
    ])
  })
})

describe('withCacheBust', () => {
  it('v 없으면 그대로, 있으면 ?v= 를 붙이고 기존 쿼리에는 & 로 잇는다', () => {
    expect(withCacheBust(START)).toBe(START)
    expect(withCacheBust(START, 7)).toBe(`${START}?v=7`)
    expect(withCacheBust(`${START}?a=1`, 7)).toBe(`${START}?a=1&v=7`)
  })
})
