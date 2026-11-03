// Artist 카드 그림의 판 배지 — 그 그림을 그린 때의 작품 스타일 버전(v1 · v2 …)을 붙이고, 완료 확인 창에 큰 Lumi 가 나온다 (v3 A5, 오너 2026-11-03)
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/studio/artist' }))
// 창은 열려 있을 때 내용을 그대로 그린다(정적 렌더에는 창 겉껍데기가 없다 — style-version-screen 과 같은 방법).
vi.mock('@/components/ui/dialog', async () => {
  const { createElement: h } = await import('react')
  type Props = { children?: ReactNode; className?: string; 'data-testid'?: string; open?: boolean }
  const plain = (tag: string) => ({ children, className, 'data-testid': testId }: Props) => h(tag, { className, 'data-testid': testId }, children)
  return {
    Dialog: ({ open, children }: Props) => (open ? children : null),
    DialogContent: plain('div'),
    DialogHeader: plain('div'),
    DialogFooter: plain('div'),
    DialogTitle: plain('h2'),
    DialogDescription: plain('p'),
  }
})

import { cardVersion, type VersionSummary } from '@/lib/artist/style-versions'
import { ArtistCompleteDialog } from '@/features/artist-room/artist-complete-dialog'
import { useLocaleStore } from '@/stores/locale-store'

const V1_TO = '2026-11-01T00:00:00.000Z'
const VERSIONS: VersionSummary[] = [
  { n: 1, styleId: 'jp_anime', current: false, active: [{ from: null, to: V1_TO }] },
  { n: 2, styleId: 'watercolor', current: true, active: [{ from: V1_TO, to: null }] },
]
const drawn = (at: string, isSelected = true) => ({ url: `https://media.example/${at}.png`, isSelected, generatedAt: at })

beforeEach(() => {
  useLocaleStore.setState({ locale: 'ko' })
})
afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
})

describe('판 배지', () => {
  // 왜: 시안 A5 "v1 · v2 …" — 재생성해도 이전 버전 그림이 기록에 남는다(10/31 작품 스타일 기록). 카드 그림이 어느 버전 것인지 바로 보인다.
  it('카드 그림에는 그 그림을 그린 때의 작품 스타일 버전이 붙는다', () => {
    expect(cardVersion({ imageUrl: 'https://media.example/a.png', candidates: [drawn('2026-10-31T09:00:00.000Z')], versions: VERSIONS })).toBe(1)
    expect(cardVersion({ imageUrl: 'https://media.example/b.png', candidates: [drawn('2026-10-31T09:00:00.000Z', false), drawn('2026-11-02T09:00:00.000Z')], versions: VERSIONS })).toBe(2)
  })

  // 왜: 검토 A L9 — 기록에서 고른 표시가 보이는 그림과 다른 그림에 남아 있으면(불러오기 · 재생성 사이) 배지가 다른 그림의 버전을 붙였다.
  it('카드에 보이는 그림과 같은 그림의 기록이 있으면, 고른 표시가 다른 기록에 있어도 보이는 그림을 그린 때의 버전을 붙인다', () => {
    const shown = 'https://media.example/shown.png'
    const candidates = [
      { url: 'https://media.example/older.png', isSelected: true, generatedAt: '2026-10-31T09:00:00.000Z' },
      { url: shown, isSelected: false, generatedAt: '2026-11-02T09:00:00.000Z' },
    ]
    expect(cardVersion({ imageUrl: shown, candidates, versions: VERSIONS })).toBe(2)
  })

  // 왜: 작품 스타일을 바꾼 적이 없으면 지금 그림이 첫 버전이다(머리 줄 "작품 스타일 · v1"과 같다).
  it('버전 기록이 없는 프로젝트의 그림은 v1이다', () => {
    expect(cardVersion({ imageUrl: 'https://media.example/a.png', candidates: [drawn('2026-10-31T09:00:00.000Z')], versions: [] })).toBe(1)
  })

  // 왜: 아직 그리지 않은 카드에 버전을 붙이면 없는 그림을 가리킨다.
  it('그림이 없는 카드에는 버전 표시가 없다', () => {
    expect(cardVersion({ imageUrl: null, candidates: [drawn('2026-10-31T09:00:00.000Z')], versions: VERSIONS })).toBeNull()
  })

  // 왜: 카드 기록이 생기기 전에 그린 그림(올린 그림 · 예전 흐름)은 그린 때를 모른다 — 지금 버전 그림으로 본다.
  it('그린 때를 모르는 그림은 지금 버전을 붙인다', () => {
    expect(cardVersion({ imageUrl: 'https://media.example/a.png', candidates: [], versions: VERSIONS })).toBe(2)
    expect(cardVersion({ imageUrl: 'https://media.example/a.png', versions: VERSIONS })).toBe(2)
  })
})

describe('큰 Lumi', () => {
  // 왜: 오너 결정 8 — 단계를 넘기기 전에 묻는 창("완료하고 Storyboard로 넘길까요?")은 큰 Lumi 자리다. 지금 단계(Artist) 옷 · 기본 모습.
  it('완료 확인 창에는 Artist 옷을 입은 Lumi가 나온다', () => {
    Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
    const out = renderToStaticMarkup(createElement(ArtistCompleteDialog, { open: true, onOpenChange: () => {}, summary: { persons: 2, places: 1, style: null } }))

    expect(out).toContain('완료하고 Storyboard로 넘길까요?')
    expect(out).toContain('/lumi/full/artist-idle.webp')
  })
})
