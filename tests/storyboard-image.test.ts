import { describe, it, expect } from 'vitest'
import { storyboardImageStartFrame, hasStoryboardImage } from '@/lib/director/storyboard-image'

// shots.storyboard_image 판정(#ref-gate 수리 2026-09-02) — 서버 영상 게이트와 클라 대기 판정이 공유한다.
describe('storyboardImageStartFrame', () => {
  it('finalize 저장 형태(url + frames + completed)는 frames.start', () => {
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

  it('frames 없는 단일 이미지 구버전은 url', () => {
    expect(storyboardImageStartFrame({ url: 'https://x/single.png', status: 'completed' })).toBe('https://x/single.png')
  })

  it('status 가 completed 가 아니면(생성 중·실패) 없음', () => {
    expect(storyboardImageStartFrame({ url: 'https://x/old.png', status: 'generating' })).toBeNull()
    expect(storyboardImageStartFrame({ url: 'https://x/old.png', status: 'failed' })).toBeNull()
    expect(storyboardImageStartFrame({ url: 'https://x/old.png', status: 'pending' })).toBeNull()
  })

  it('status 가 없는 객체는 url/frames 로만 판정(구 클라 업로드 형태)', () => {
    expect(storyboardImageStartFrame({ url: 'https://x/u.png' })).toBe('https://x/u.png')
    expect(storyboardImageStartFrame({ url: '   ' })).toBeNull()
    expect(storyboardImageStartFrame({})).toBeNull()
  })

  it('문자열은 하위호환으로 그대로, 빈 값·배열·null 은 없음', () => {
    expect(storyboardImageStartFrame('https://x/s.png')).toBe('https://x/s.png')
    expect(storyboardImageStartFrame('  ')).toBeNull()
    expect(storyboardImageStartFrame(null)).toBeNull()
    expect(storyboardImageStartFrame(undefined)).toBeNull()
    expect(storyboardImageStartFrame(['https://x/s.png'])).toBeNull()
    expect(hasStoryboardImage(null)).toBe(false)
  })
})
