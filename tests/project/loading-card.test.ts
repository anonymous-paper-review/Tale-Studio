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

  // 왜: 검토 A L5 — ✓ · ● · ○ 기호는 화면 읽기가 읽지 않는다. 지금 단계는 aria-current 로, 끝난 · 남은 단계는 숨은 글로 알린다.
  it('기다리는 카드의 단계는 화면 읽기에 지금 단계를 알리고, 끝난 단계 · 남은 단계도 글로 읽힌다', () => {
    for (const lumi of ['writer', undefined] as const) {
      const html = card({ lumi, card: 'loading', steps: STEPS })
      expect(html, String(lumi)).toMatch(/<li[^>]*aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*만드는 중/)
      expect((html.match(/aria-current="step"/g) ?? []).length, String(lumi)).toBe(1)
      expect(html, String(lumi)).toMatch(/<span class="sr-only">완료<\/span>(?:(?!<\/li>)[\s\S])*요청 읽기/)
      expect(html, String(lumi)).toMatch(/<span class="sr-only">남음<\/span>(?:(?!<\/li>)[\s\S])*마무리/)
    }
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

  // 왜: 설명은 화면마다 다르다 — 시안의 "창을 닫아도 계속 만들어요"는 모든 화면에 맞는 말이 아니다(prose 갈래 2026-11-09).
  //   할 말이 없는 화면은 줄을 비운다. 아무것도 안 주면 나오는 기본 잠금 안내는 그대로다(tests/project/ai-busy-rename.test.ts).
  it('부르는 쪽이 설명을 비워 두면 기다리는 카드에 설명 줄이 없다', () => {
    for (const lumi of ['writer', undefined] as const) {
      const html = card({ lumi, description: null, steps: STEPS })
      expect(html, String(lumi)).not.toContain('AI가 작업하는 동안은 화면과 채팅이 잠겨요')
      expect(html, String(lumi)).toMatch(/만들고 있어요<\/h2><\/div>|만들고 있어요<\/h2><\/div><\/div>/)
    }
  })

  // 왜: 같은 단계 안에서 기다릴 때(WL 문단 다시 쓰기 · AR 다시 그리기)는 그림 없이 같은 카드 모양을 쓴다(prose 갈래 2026-11-09).
  it('Lumi 없이 새 기다리는 카드를 부르면 그림 없이 단계 ✓ · ● · ○ 와 진행 막대로 그린다', () => {
    const html = card({ card: 'loading', steps: STEPS, progress: 40 })
    expect(html).not.toContain('/lumi/')
    expect(html).not.toContain('lucide-loader-circle')
    expect(html).toMatch(/✓<\/span><span[^>]*>요청 읽기[\s\S]*●<\/span><span[^>]*>만드는 중[\s\S]*○<\/span><span[^>]*>마무리/)
    expect(html).toContain('style="width:40%"')
  })

  // 왜: Lumi 옷이 없으니 카드가 단계 색을 따로 정하지 않는다 — 놓인 화면(지금 단계)의 색으로 ● 와 막대를 칠한다.
  it('Lumi 없는 새 기다리는 카드는 지금 단계 색을 따른다', () => {
    const html = card({ card: 'loading', steps: STEPS, progress: 40 })
    expect(html).not.toMatch(/^(?:<link[^>]*\/>)*<div[^>]*data-stage=/)
    expect(html).toContain('text-stage')
    expect(html).toContain('bg-stage-gradient')
  })

  // 왜: 진행 정도를 모르는 일(대부분의 AI 작업)에 빈 막대를 그리면 멈춘 것처럼 보인다.
  it('진행 정도를 모르면 기다리는 카드에 진행 막대가 없다', () => {
    for (const lumi of ['artist', undefined] as const) {
      const html = card({ lumi, steps: STEPS })
      expect(html, String(lumi)).not.toMatch(/style="width:\d+%"/)
      expect(html, String(lumi)).not.toContain('bg-progress-track')
    }
  })
})
