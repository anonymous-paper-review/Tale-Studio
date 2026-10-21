// 스타일 이름은 화면 언어로 보인다 · 영어 화면에서 한국어 이름이 나오지 않는다 (2026-10-21 오너 "영어 언어라도 스타일 템플릿에서 이름이 한글로 나옴")
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { styleAnchorName } from '@/lib/style-anchor-name'

// 개발 · 운영 DB style_anchors 의 이름(label)과 부제(subtitle) 그대로 — 이름은 한국어 하나뿐이다.
const CATALOG = [
  { key: 'real', label: '실사', subtitle: null },
  { key: 'real_3d', label: '3D 애니메이션', subtitle: null },
  { key: 'jp_anime', label: '2D 일본 애니', subtitle: null },
  { key: 'us_cartoon', label: '미국 카툰', subtitle: null },
  { key: 'stop_motion', label: '스톱모션', subtitle: null },
  { key: 'watercolor', label: '수채', subtitle: null },
  { key: 'real_jp_melo', label: '일본 멜로', subtitle: 'Japanese Melodrama' },
  { key: 'real_psy_horror', label: '심리 공포', subtitle: 'Psychological Horror' },
  { key: 'real_hitech_sf', label: '하이테크 SF', subtitle: 'Hi-Tech Sci-Fi' },
  { key: 'real_desert_fantasy', label: '사막 판타지', subtitle: 'Desert Fantasy' },
  { key: 'real_urban_hero', label: '도심 히어로', subtitle: 'Urban Hero' },
  { key: 'real_euro_period', label: '유럽 역사극', subtitle: 'European Period Drama' },
]

describe('스타일 이름', () => {
  it('영어 화면에서는 스타일 이름을 영어로 보인다', () => {
    // 왜: 영어로 쓰는 사람에게 스타일 고르기 창의 이름이 한국어로 나왔다(DB 이름이 한국어 하나뿐).
    expect(styleAnchorName(CATALOG[2], 'en')).toBe('2D Japanese Anime')
    expect(styleAnchorName(CATALOG[0], 'en')).toBe('Live Action')
    expect(styleAnchorName(CATALOG[6], 'en')).toBe('Japanese Melodrama')
  })

  it('기본 스타일 12종 모두 영어 화면에서 한글이 섞이지 않는다', () => {
    // 왜: 하나라도 빠지면 그 카드만 한국어로 남는다.
    for (const anchor of CATALOG) expect(styleAnchorName(anchor, 'en'), anchor.key).not.toMatch(/[가-힣]/)
  })

  it('한국어 화면에서는 지금 이름 그대로 보인다', () => {
    // 왜: 정상 경로 고정 — 한국어 이름은 DB 이름이 정본이다.
    for (const anchor of CATALOG) expect(styleAnchorName(anchor, 'ko')).toBe(anchor.label)
  })

  it('영어 이름을 모르는 새 스타일은 저장된 이름 그대로 보인다', () => {
    // 왜: DB 에 새 스타일을 넣었는데 영어 이름이 아직 없으면 빈칸 대신 있는 이름을 보인다.
    expect(styleAnchorName({ key: 'new_style', label: '새 스타일', subtitle: null }, 'en')).toBe('새 스타일')
  })

  it('스타일 고르기 창 · Artist 머리 · 인물/배경 상세 · 확정 창이 화면 언어 이름을 쓴다', () => {
    // 왜: 이름을 보이는 곳 하나라도 예전 방식이면 그 화면만 한국어로 남는다.
    const files = [
      'src/features/artist-room/style-make-dialog.tsx',
      'src/app/studio/artist/page.tsx',
      'src/features/artist/character-view-dialog.tsx',
      'src/features/artist/world-view-dialog.tsx',
      'src/components/handoff/producer-lock-dialog.tsx',
    ]
    for (const file of files) expect(readFileSync(path.join(process.cwd(), file), 'utf8'), file).toMatch(/styleAnchorName\(/)
  })
})
