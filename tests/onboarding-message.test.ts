import { describe, it, expect } from 'vitest'
import {
  buildArtistRefreshMessage,
  artistRefreshSuggestionKey,
} from '@/lib/artist/onboarding-message'

describe('buildArtistRefreshMessage', () => {
  const look = { artStyle: 'dark_fantasy_gothic', colorMeaning: { Crimson: '생명의 대가', Gold: '거짓 평온' } }

  it('상태별 카피 분리 — 초안/이미지없음/실패, no-image 는 초안이라 부르지 않음', () => {
    const msg = buildArtistRefreshMessage({
      characters: [
        { name: '소녀', state: 'look-pending' },
        { name: '행인', state: 'no-image' },
        { name: '늙은 기사', state: 'failed' },
      ],
      look,
    })
    expect(msg).toContain('소녀')
    expect(msg).toContain('초안')
    expect(msg).toContain('행인')
    expect(msg).toContain('아직 이미지가 없어요')
    expect(msg).toContain('늙은 기사')
    expect(msg).toContain('콘텐츠 정책')
    expect(msg).toContain('우회')
    // no-image 는 "초안"으로 라벨되면 안 됨 (행인 라인에 초안 없음)
    const noImageLine = msg.split('\n').find((l) => l.includes('행인'))!
    expect(noImageLine).not.toContain('초안')
    // look 요약 포함
    expect(msg).toContain('dark_fantasy_gothic')
  })

  it('look-pending/no-image 있으면 "최종 룩으로 정리" 안내, failed-only 면 일괄 안내 없음', () => {
    const withBulk = buildArtistRefreshMessage({ characters: [{ name: '소녀', state: 'look-pending' }] })
    expect(withBulk).toContain('최종 룩으로 정리')
    const failedOnly = buildArtistRefreshMessage({ characters: [{ name: '소녀', state: 'failed' }] })
    expect(failedOnly).not.toContain('최종 룩으로 정리')
    expect(failedOnly).toContain('우회')
  })

  it('no-image-only 면 메시지 전체에 "초안" 단어가 없음(일괄 CTA도 "미생성 이미지"만)', () => {
    const noImageOnly = buildArtistRefreshMessage({
      characters: [{ name: '행인', state: 'no-image' }],
      look: { artStyle: 'ink wash' },
    })
    expect(noImageOnly).not.toContain('초안')
    expect(noImageOnly).toContain('미생성 이미지')
    expect(noImageOnly).toContain('최종 룩으로 정리')
  })

  it('look-pending-only 면 일괄 CTA가 "초안 이미지"(미생성 단어 없음)', () => {
    const pendingOnly = buildArtistRefreshMessage({ characters: [{ name: '소녀', state: 'look-pending' }] })
    expect(pendingOnly).toContain('초안 이미지')
    expect(pendingOnly).not.toContain('미생성')
  })

  it('대상 0 이면 빈 문자열', () => {
    expect(buildArtistRefreshMessage({ characters: [] })).toBe('')
  })

  it('look 없어도 동작(그림체 줄 생략)', () => {
    const msg = buildArtistRefreshMessage({ characters: [{ name: '소녀', state: 'look-pending' }] })
    expect(msg).toContain('writer가 최종 그림체를 정했어요')
  })
})

describe('artistRefreshSuggestionKey', () => {
  const base = { projectId: 'p1', lookVersion: 'lvA', refreshGap: 2, failedCount: 1 }
  it('동일 입력 동일 키', () => {
    expect(artistRefreshSuggestionKey(base)).toBe(artistRefreshSuggestionKey({ ...base }))
  })
  it('refreshGap 델타 → 다른 키', () => {
    expect(artistRefreshSuggestionKey(base)).not.toBe(artistRefreshSuggestionKey({ ...base, refreshGap: 3 }))
  })
  it('failedCount 델타 → 다른 키 (실패는 lookVersion 안 바꿔도 재발사)', () => {
    expect(artistRefreshSuggestionKey(base)).not.toBe(artistRefreshSuggestionKey({ ...base, failedCount: 2 }))
  })
  it('lookVersion 변경(재실행) → 다른 키', () => {
    expect(artistRefreshSuggestionKey(base)).not.toBe(artistRefreshSuggestionKey({ ...base, lookVersion: 'lvB' }))
  })
})
