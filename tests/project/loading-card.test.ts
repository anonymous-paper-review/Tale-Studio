// 새 기다리는 카드(11/5 Feedback/Loading Card)가 단계 표시(✓ · ● · ○)와 L 크기 Lumi 로 그려지는지 검사한다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { AiBusyCard } from '@/components/ai-busy-overlay'

const STEPS = [
  { label: '요청 읽기', state: 'done' as const },
  { label: '만드는 중', state: 'current' as const },
  { label: '마무리', state: 'todo' as const },
]
const card = (props: Partial<Parameters<typeof AiBusyCard>[0]>) =>
  renderToStaticMarkup(createElement(AiBusyCard, { title: '만들고 있어요', ...props }))

describe('새 기다리는 카드', () => {
  // 왜: 11/5 시안 — 단계는 글자 기호로 끝남(✓) · 지금(●, 단계 색) · 남음(○)을 나눠 보인다. 무엇이 끝났고 무엇이 남았는지 한눈에 본다.
  it('기다리는 카드의 단계는 끝난 것 ✓ · 지금 ● · 남은 것 ○ 로 보인다', () => {
    const html = card({ lumi: 'artist', steps: STEPS })
    expect(html).toMatch(/✓<\/span><span[^>]*>요청 읽기[\s\S]*●<\/span><span[^>]*>만드는 중[\s\S]*○<\/span><span[^>]*>마무리/)
  })

  // 왜: SYS "기다리는 팝업 = Lumi L" — 예전 카드의 240 큰 Lumi 는 새 카드 폭(372)에 맞지 않는다.
  it('기다리는 카드의 Lumi 는 기다리는 팝업 크기(L)로 그려진다', () => {
    expect(card({ lumi: 'writer' })).toMatch(/width="100" height="77"/)
  })

  // 왜: 시안 순서 — Lumi → 제목 → 설명 → 단계 → 진행 막대. 막대가 맨 아래라 단계를 읽은 뒤 얼마나 남았는지 본다.
  it('기다리는 카드는 단계 아래에 진행 막대를 둔다', () => {
    const html = card({ lumi: 'artist', steps: STEPS, progress: 40 })
    expect(html.indexOf('마무리')).toBeLessThan(html.indexOf('style="width:40%"'))
  })
})
