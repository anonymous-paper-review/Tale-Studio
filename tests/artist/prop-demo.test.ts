// 데모(보기 전용 공유)의 소품 카드 — 그림은 보이지만 [그리기] · [다시 그리기] 단추는 보이지 않는다 (D7, 2026-11-22)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/demo/context', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/demo/context')>()), isDemoSession: () => true }))

import { PropPanel } from '@/features/artist/prop-panel'
import { PropDetailPanels } from '@/features/artist/prop-view-dialog'
import { useArtistStore } from '@/stores/artist-store'
import type { PropAsset } from '@/types'

const initial = { ...useArtistStore.getInitialState() }
const asset = (over: Partial<PropAsset> = {}): PropAsset => ({ propId: 'obj_ring', name: '은반지', appearance: 'a ring', appearanceNative: '반지', imageUrl: null, sourceHash: null, origin: 'producer', ...over })
const seed = (state: Partial<ReturnType<typeof useArtistStore.getState>>) => {
  useArtistStore.setState(state)
  Object.assign(useArtistStore.getInitialState(), state)
}
afterEach(() => seed({ propAssets: initial.propAssets, propUsage: initial.propUsage, generatingProps: initial.generatingProps, propFailures: initial.propFailures }))

describe('데모의 소품 카드', () => {
  // 왜: 데모는 보기 전용이라 그리기 요청이 막혀 있다(스토어 · 서버 둘 다) — 눌러도 아무 일이 없는 단추를 보이지 않는다(인물 · 배경 카드에는 그리기 단추가 없다).
  it('데모(보기 전용 공유) 화면에서는 소품 [그리기] · [다시 그리기] 단추를 보이지 않는다', () => {
    seed({ propAssets: [asset(), asset({ propId: 'obj_key', name: '열쇠' })], propUsage: {}, generatingProps: [], propFailures: { obj_key: { error: 'x', moderation: false, failCount: 1, safeFailCount: 0 } } })
    const html = renderToStaticMarkup(createElement(PropPanel, { columns: 2 }))
    expect(html).toContain('은반지')
    expect(html).not.toContain('data-testid="artist-prop-draw"')
    expect(html).not.toContain('data-testid="artist-prop-redraw"')
  })

  // 왜: 같은 까닭 — 데모 창에서는 그림과 생김새만 보이고, 바꿀 점 · [다시 그리기] · 생김새 고치기는 없다.
  it('데모(보기 전용 공유) 화면의 소품 창은 바꿀 점 · [다시 그리기] 없이 생김새를 보기만 한다', () => {
    seed({ propAssets: [asset({ imageUrl: 'https://media.test/ring.png' })], propUsage: {}, generatingProps: [], propFailures: {} })
    const html = renderToStaticMarkup(createElement(PropDetailPanels, { propId: 'obj_ring' }))
    expect(html).toContain('https://media.test/ring.png')
    expect(html).not.toContain('data-testid="prop-detail-instruction"')
    expect(html).not.toContain('data-testid="prop-detail-redraw"')
    expect(html).not.toContain('data-testid="prop-detail-description-edit"')
  })
})
