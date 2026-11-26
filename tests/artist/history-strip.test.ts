// Artist 인물 · 배경 · 소품 카드의 지난 그림 줄은 그린 때로 이름을 달고, 다른 작품 스타일 판에서 그린 그림은 흐리게 보인다 (오너 2026-11-26 A4)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VersionStrip } from '@/components/version-history/version-history-hover'
import { useArtistHistoryStrip } from '@/features/artist-room/use-history-strip'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProducerStore } from '@/stores/producer-store'

const NOW = new Date('2026-11-26T12:00:00.000Z')
const cand = (id: string, hoursAgo: number, selected = false) => ({
  id, url: `https://media.test/${id}.png`, isSelected: selected, sourceHash: null,
  generatedAt: new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString(),
})
const versionView = (n: number, styleKey: string, current: boolean, active: Array<{ from: string | null; to: string | null }>) =>
  ({ n, styleId: styleKey, styleKey, customStyle: null, current, active, createdAt: '', thumbs: [] })

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 지금 값을 처음 값으로 옮겨 그린다(style-version-screen 과 같은 방법). */
function serveCurrent(...stores: Array<{ getState: () => object; getInitialState: () => object }>) {
  for (const store of stores) Object.assign(store.getInitialState(), store.getState())
}
function Probe({ candidates, shown }: { candidates: ReturnType<typeof cand>[]; shown: string | null }) {
  const strip = useArtistHistoryStrip(candidates, shown)
  return createElement(VersionStrip, { ...strip, aspect: '16 / 9', onOpen: () => {}, onMore: () => {} })
}
const render = (candidates: ReturnType<typeof cand>[], shown: string | null) => {
  serveCurrent(useLocaleStore, useProducerStore, useArtistVersionStore)
  return renderToStaticMarkup(createElement(Probe, { candidates, shown })).replace(/&#x27;/g, "'")
}
const cardTag = (out: string, id: string) => out.match(new RegExp(`<button[^>]*data-id="${id}"[^>]*>`))?.[0] ?? ''

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  useLocaleStore.setState({ locale: 'en' })
  useProducerStore.setState({
    styleAnchorKey: 'watercolor', customStyleAnchor: null,
    styleAnchors: [
      { key: 'real', label: '실사', medium: 'photo', imageUrl: null, previewUrl: null, subtitle: null },
      { key: 'watercolor', label: '수채화', medium: 'watercolor', imageUrl: null, previewUrl: null, subtitle: null },
    ],
  } as never)
  useArtistVersionStore.setState({ versions: [] })
})
afterEach(() => vi.useRealTimers())

describe('Artist 지난 그림 줄', () => {
  it('인물 · 배경 · 소품 카드의 지난 그림은 카드에 보이는 그림을 빼고 가장 새 것부터 5개까지, 그린 때("3시간 전")로 이름이 붙는다', () => {
    // 왜: 오너 A4 "과거 이력 아래에 뜨기 (5개까지 작은 카드 형태로)" — Artist 칸에는 판 번호가 없어 언제 그린 그림인지로 가린다(혼자 정한 것).
    const candidates = [cand('a', 50), cand('b', 30), cand('c', 3), cand('d', 2), cand('e', 1), cand('f', 0.5), cand('now', 0, true)]
    const out = render(candidates, 'https://media.test/now.png')
    expect([...out.matchAll(/data-id="([a-z]+)"/g)].map((m) => m[1])).toEqual(['f', 'e', 'd', 'c', 'b'])
    expect(out).toContain('>30m ago<')
    expect(out).toContain('>3h ago<')
    expect(out).toContain('>1d ago<')
    expect(out).toContain('>+1<')
    useLocaleStore.setState({ locale: 'ko' })
    expect(render(candidates, 'https://media.test/now.png')).toContain('>3시간 전<')
  })

  it('다른 작품 스타일 판에서 그린 지난 그림은 흐리게 보이고, 마우스를 올리면 어느 판 · 스타일인지 보인다', () => {
    // 왜: 작품 스타일은 하나라 다른 스타일 그림은 채택할 수 없다(10/28 오너) — 상세 기록의 [불러오기]가 꺼지는 것과 같은 판정 · 같은 말.
    const switchedAt = new Date(NOW.getTime() - 10 * 3600_000).toISOString()
    useArtistVersionStore.setState({ versions: [versionView(1, 'real', false, [{ from: null, to: switchedAt }]), versionView(2, 'watercolor', true, [{ from: switchedAt, to: null }])] as never })
    const out = render([cand('old', 20), cand('new', 2), cand('now', 0, true)], 'https://media.test/now.png')
    expect(cardTag(out, 'old')).toContain('opacity-50')
    expect(cardTag(out, 'old')).toContain('title="20h ago · v1 · Live Action · another style"')
    expect(cardTag(out, 'new')).not.toContain('opacity-50')
    expect(cardTag(out, 'new')).toContain('title="2h ago"')
  })
})
