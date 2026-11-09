// 노드 · 카드 위에서 기다릴 때 그 노드를 덮는 카드와 완성 배지가 단계 색 · S 크기 Lumi · 진행 막대로 그려지는지 검사한다 (11/5 SYS)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { DoneBadge, NodeWaitCard, STAGE_FRAME } from '@/components/feedback/node-wait'

describe('노드 · 카드 위 기다림', () => {
  // 왜: SYS "노드 · 카드 위에서 기다릴 때" — 그 노드 크기에 맞춰 덮고, 단계 옷 Lumi(S)가 만드는 중 모습으로 기다리며 얼마나 남았는지 막대로 보인다.
  it('노드 위 기다림 카드는 그 단계 옷 Lumi(S)가 만드는 중 모습이고, 진행을 막대로 보인다', () => {
    const html = renderToStaticMarkup(createElement(NodeWaitCard, {
      lumi: 'director', title: '영상을 만들고 있어요', description: '샷 3 · I2V 4초 · 약 1분 남음', progress: 60, note: '다음 차례: 새 샷 → 샷 2',
    }))
    expect(html).toMatch(/^(?:<link[^>]*\/>)*<div[^>]*data-stage="director"/)
    expect(html).toContain('src="/lumi/full/director-loading.webp"')
    expect(html).toMatch(/width="56" height="43"/)
    expect(html).toContain('style="width:60%"')
    for (const text of ['영상을 만들고 있어요', '샷 3 · I2V 4초 · 약 1분 남음', '다음 차례: 새 샷 → 샷 2']) expect(html).toContain(text)
  })

  // 왜: SYS "완성 표시" — 다 만든 노드는 단계 그라데이션 "✓ 완성" 배지와 단계 색 테두리로 알린다.
  it('완성 배지는 "✓ 완성" 을 그 단계 색으로 쓰고, 기다림 · 완성 노드는 단계 색 테두리를 단다', () => {
    const html = renderToStaticMarkup(createElement(DoneBadge, { lumi: 'artist' }))
    expect(html).toMatch(/^<span[^>]*data-stage="artist"/)
    expect(html).toContain('✓ 완성')
    expect(STAGE_FRAME).toContain('border-stage')
  })
})
