// 샷 상세 Take 줄의 그림 이름 — 끝 그림을 따로 쓴 옛 Take 만 "시작 v{s} + 끝 v{e}", 그 밖(끝을 쓰지 않은 새 Take)은 이력 판 · @멘션과 같은 "그림 v{n}"인지 검사한다 (fb-director QA B · 리드 2026-11-23)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { takeImageLabel } from '@/lib/director/shot-detail'
import { withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { translate } from '@/lib/i18n/translate'
import type { VideoNodeData } from '@/types/director'

const version = (id: string, tag: string, at: number) => ({
  id,
  url: `https://media.test/${tag}-s.png`,
  frames: { start: `https://media.test/${tag}-s.png`, direction: `https://media.test/${tag}-d.png`, end: `https://media.test/${tag}-e.png` },
  generatedAt: at,
  source: 'generated' as const,
})
const two = withStoryboardVersion(withStoryboardVersion(null, version('job-1', 'a', 1), { select: true }), version('job-2', 'b', 2), { select: true })
const label = (madeFrames: VideoNodeData['madeFrames'], locale: 'ko' | 'en' = 'ko') => {
  const named = takeImageLabel(two, { madeFrames })
  return named ? translate(locale, named.key, named.params) : null
}

describe('같이 정한 것(리드 11/23)', () => {
  it('끝을 쓰지 않은 새 Take 는 샷 상세 Take 줄에 이력 판 · @멘션과 같은 "그림 v{n}"으로 보이고 "시작 v1 + 끝 v1"로 보이지 않는다', () => {
    // 왜: 방식 넷(시작+끝 폐기) 뒤의 새 Take 는 끝 그림을 쓰지 않는데, 끝 버전을 모르면 시작 버전을 끝에도 적어 "시작 v1 + 끝 v1"로 보였다(fb-director QA B).
    //   말은 같은 화면의 이력 판 · @멘션과 같은 "그림 v{n}"(리드 11/23).
    expect(label({ start: 'https://media.test/a-s.png?v=1', end: null })).toBe('그림 v1')
    expect(label({ start: 'https://media.test/b-s.png', end: null, middle: 'https://media.test/b-d.png' }, 'en')).toBe('Image v2')
    // 화면(샷 상세 영상 탭)이 이 이름을 쓴다.
    const tab = readFileSync('src/features/director/shot-detail/shot-video-tab.tsx', 'utf8')
    expect(tab).toMatch(/const named = takeImageLabel\(data\.storyboardImage, take\.data\)/)
    expect(tab).not.toMatch(/end: used\.end \?\? used\.start/)
  })

  it('끝 그림을 따로 쓴 옛 Take 만 샷 상세 Take 줄에 "시작 v{s} + 끝 v{e}"로 보인다', () => {
    // 왜: 옛 시작+끝 Take 는 실제로 끝 그림을 썼다 — 어느 그림으로 만든 영상인지 지금처럼 읽혀야 한다(D7 · 리드 B).
    expect(label({ start: 'https://media.test/a-s.png', end: 'https://media.test/a-e.png' })).toBe('시작 v1 + 끝 v1')
    expect(label({ start: 'https://media.test/b-s.png', end: 'https://media.test/a-e.png' })).toBe('시작 v2 + 끝 v1')
    // 쓴 그림을 모르면 이름을 비운다(지금 그대로).
    expect(label(null)).toBeNull()
  })
})
