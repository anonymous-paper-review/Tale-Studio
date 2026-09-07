// 러프 그림의 시작·방향·끝 장면을 빠짐없이 보여주고, 최신 그림 주소를 사용한다
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
  it('세 장면 그림이 있으면 시작·방향·끝 순서로 모두 보여주고 최신 그림을 사용한다', () => {
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

  it('예전 형식처럼 장면 그림이 하나뿐이면 그 그림만 보여준다', () => {
    // generatedAt 은 RoughStoryboardImage 의 필수 필드다 — 없는 상태를 시험하면
    // 일어날 수 없는 경우를 잠그게 된다. 구버전을 가르는 것은 frames 유무뿐이다.
    const urls = cycleFrameUrls({ url: START, generatedAt: 1755000000000, frames: undefined })
    expect(urls).toEqual([`${START}?v=1755000000000`])
  })

  it('세 장면 그림을 모두 작은 미리보기로 보여주고 최신 상태를 유지한다', () => {
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
  it('그림 주소에 새 버전 정보가 있으면 기존 정보와 함께 반영하고 없으면 그대로 둔다', () => {
    expect(withCacheBust(START)).toBe(START)
    expect(withCacheBust(START, 7)).toBe(`${START}?v=7`)
    expect(withCacheBust(`${START}?a=1`, 7)).toBe(`${START}?a=1&v=7`)
  })
})
