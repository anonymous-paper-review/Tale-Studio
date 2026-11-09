// 노드 · 카드 위에서 기다릴 때 그 노드를 덮는 카드와 완성 배지가 단계 색 · S 크기 Lumi · 진행 막대로 그려지는지 검사한다 (11/5 SYS)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
// 카드가 Lumi 에 무엇을 부탁했는지 적어 두고 그대로 그린다(서버 그리기는 늘 그림이라 겉모습으로는 구분이 안 된다).
const asked = vi.hoisted(() => [] as Array<Record<string, unknown>>)
vi.mock('@/components/lumi/lumi', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/lumi/lumi')>()
  const { createElement: make } = await import('react')
  return { ...real, Lumi: (props: Parameters<typeof real.Lumi>[0]) => (asked.push({ ...props }), make(real.Lumi, props)) }
})

import { DoneBadge, NodeWaitCard, STAGE_FRAME } from '@/components/feedback/node-wait'
import { lumiRenderMode } from '@/lib/lumi'

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

  // 왜: 검토 C — 더한 샷을 여럿 그리거나 Director 영상이 동시에 여럿 돌면 카드마다 움직이는 Lumi 가 WebGL 문맥을 하나씩 열어
  //   브라우저 한도에 걸린다(보드 6 · 시연 10, Director 3 · 시연 10). 카드 위 Lumi 는 S(56)라 움직임이 거의 안 보인다.
  it('노드 위 기다림 카드는 움직이지 않는 Lumi 그림을 쓴다', () => {
    asked.length = 0
    renderToStaticMarkup(createElement(NodeWaitCard, { lumi: 'storyboard', title: '그리고 있어요' }))
    expect(asked).toEqual([expect.objectContaining({ persona: 'storyboard', state: 'loading', still: true })])
    // 그림으로 정한 Lumi 는 WebGL · 움직이는 파일이 다 준비돼도 그림으로 남는다.
    expect(lumiRenderMode({ webgl: true, reducedMotion: false, script: 'ready', still: true })).toBe('still')
    expect(lumiRenderMode({ webgl: true, reducedMotion: false, script: 'ready' })).toBe('animated')
  })

  // 왜: SYS "완성 표시" — 다 만든 노드는 단계 그라데이션 "✓ 완성" 배지와 단계 색 테두리로 알린다.
  it('완성 배지는 "✓ 완성" 을 그 단계 색으로 쓰고, 기다림 카드는 단계 색 테두리를 단다', () => {
    const html = renderToStaticMarkup(createElement(DoneBadge, { lumi: 'artist' }))
    expect(html).toMatch(/^<span[^>]*data-stage="artist"/)
    expect(html).toContain('✓ 완성')
    const card = renderToStaticMarkup(createElement(NodeWaitCard, { lumi: 'artist', title: '그리고 있어요' }))
    const rootClass = card.match(/^(?:<link[^>]*\/>)*<div[^>]*class="([^"]*)"/)?.[1] ?? ''
    for (const cls of STAGE_FRAME.split(' ')) expect(rootClass.split(' ')).toContain(cls)
    expect(STAGE_FRAME).toContain('border-stage')
  })
})
