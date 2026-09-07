// #fal-cdn-host (2026-08-01) 회귀 가드.
//
// fal 이 새 CDN 호스트를 추가할 때마다 정상 생성물이 'invalid video url in provider result' 로
// 죽던 문제. 정적 목록 대신 도메인 소속으로 판정한다 — 아래는 그 판정의 경계 조건.
import { describe, expect, it } from 'vitest'
import { isFalMediaHost } from '@/lib/fal/media-host'

describe('isFalMediaHost', () => {
  it('실제로 막혔던 호스트를 통과시킨다', () => {
    // 2026-07-31 director 영상 실패의 원인. fal 응답:
    //   https://v3b.fal.media/files/b/0aa47b44/554PJpoDDRLylScRHMGQD_a9jIa3ko.mp4
    expect(isFalMediaHost('v3b.fal.media')).toBe(true)
  })

  it('기존 호스트도 그대로 통과한다', () => {
    expect(isFalMediaHost('fal.media')).toBe(true)
    expect(isFalMediaHost('v3.fal.media')).toBe(true)
  })

  it('앞으로 늘어날 서브도메인도 통과한다 (정적 목록이 낡지 않게)', () => {
    expect(isFalMediaHost('v4.fal.media')).toBe(true)
    expect(isFalMediaHost('cdn.eu.fal.media')).toBe(true)
  })

  it('대소문자·공백에 흔들리지 않는다', () => {
    expect(isFalMediaHost('  V3B.FAL.MEDIA ')).toBe(true)
  })

  it('도메인을 사칭하는 호스트는 막는다 (접미사 판정의 점 포함)', () => {
    expect(isFalMediaHost('evilfal.media')).toBe(false)
    expect(isFalMediaHost('fal.media.evil.com')).toBe(false)
    expect(isFalMediaHost('notfal.media')).toBe(false)
    expect(isFalMediaHost('xfal.media')).toBe(false)
  })

  it('무관한 호스트는 막는다', () => {
    expect(isFalMediaHost('example.com')).toBe(false)
    expect(isFalMediaHost('localhost')).toBe(false)
    expect(isFalMediaHost('169.254.169.254')).toBe(false)
    expect(isFalMediaHost('')).toBe(false)
  })
})
