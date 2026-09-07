// 완료된 스토리보드 이미지만 시작 화면에 사용하고, 준비 중인 이미지는 사용하지 않는다 (#ref-gate 수리 2026-09-02)
import { describe, it, expect } from 'vitest'
import { storyboardImageStartFrame, hasStoryboardImage } from '@/lib/director/storyboard-image'

// shots.storyboard_image 판정(#ref-gate 수리 2026-09-02) — 서버 영상 게이트와 클라 대기 판정이 공유한다.
describe('storyboardImageStartFrame', () => {
  it('스토리보드 시작·방향·끝 이미지가 모두 준비되면 시작 이미지를 사용한다', () => {
    const img = {
      url: 'https://x/start.png',
      frames: { start: 'https://x/start.png', direction: 'https://x/dir.png', end: 'https://x/end.png' },
      status: 'completed',
      errorMessage: null,
      generatedAt: 1,
    }
    expect(storyboardImageStartFrame(img)).toBe('https://x/start.png')
    expect(hasStoryboardImage(img)).toBe(true)
  })

  it('이전 형식의 단일 이미지가 준비되면 그 이미지를 사용한다', () => {
    expect(storyboardImageStartFrame({ url: 'https://x/single.png', status: 'completed' })).toBe('https://x/single.png')
  })

  it('이미지 생성이 끝나지 않았거나 실패하면 사용하지 않는다', () => {
    expect(storyboardImageStartFrame({ url: 'https://x/old.png', status: 'generating' })).toBeNull()
    expect(storyboardImageStartFrame({ url: 'https://x/old.png', status: 'failed' })).toBeNull()
    expect(storyboardImageStartFrame({ url: 'https://x/old.png', status: 'pending' })).toBeNull()
  })

  it('완료 상태 표시가 없어도 업로드된 이미지가 있으면 사용한다', () => {
    expect(storyboardImageStartFrame({ url: 'https://x/u.png' })).toBe('https://x/u.png')
    expect(storyboardImageStartFrame({ url: '   ' })).toBeNull()
    expect(storyboardImageStartFrame({})).toBeNull()
  })

  it('이미지가 한 개뿐이면 사용하고 비어 있거나 여러 값이면 사용하지 않는다', () => {
    expect(storyboardImageStartFrame('https://x/s.png')).toBe('https://x/s.png')
    expect(storyboardImageStartFrame('  ')).toBeNull()
    expect(storyboardImageStartFrame(null)).toBeNull()
    expect(storyboardImageStartFrame(undefined)).toBeNull()
    expect(storyboardImageStartFrame(['https://x/s.png'])).toBeNull()
    expect(hasStoryboardImage(null)).toBe(false)
  })
})
