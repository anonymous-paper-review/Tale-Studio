// AI가 일하는 동안 덮는 잠금 화면에 큰 Lumi를 주면 도는 원 대신 Lumi가 기다리고, 실패 안내면 오류 모습이 되며, 진행 막대가 Lumi 옷의 단계 색인지 검사한다 (2026-11-03 v3 · 오너 "큰 Lumi 를 단계 넘어갈 때 기다리는 화면에")
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { AiBusyCard } from '@/components/ai-busy-overlay'

const card = (props: Partial<Parameters<typeof AiBusyCard>[0]>) =>
  renderToStaticMarkup(createElement(AiBusyCard, { title: '산문 초안을 쓰고 있어요', ...props }))
// 카드 맨 바깥 틀 — 서버 그리기는 그림 미리 받기(<link rel="preload">)를 카드 앞에 둔다.
const cardRoot = (attr: string) => new RegExp(`^(?:<link[^>]*/>)*<div[^>]*${attr}`)

describe('잠금 화면의 큰 Lumi', () => {
  it('Lumi를 주면 AI가 일하는 동안 도는 원 자리에 그 단계 옷을 입은 큰 Lumi가 기다리는 모습으로 보인다', () => {
    // 왜: 단계를 넘어가며 기다리는 화면(산문 초안 · Storyboard 만들기 등)에 가이드의 로딩 Lumi 를 둔다(오너 11/3). 움직이는 파일을 받기 전 · 서버 그리기에서는 같은 모습의 그림이다.
    const html = card({ busy: true, lumi: 'writer' })
    expect(html).toContain('src="/lumi/full/writer-loading.webp"')
    expect(html).not.toContain('lucide-loader-circle')
    expect(html).toContain('산문 초안을 쓰고 있어요')
  })

  it('Lumi를 주고 일이 멈춰 실패 안내로 바뀌면 같은 자리의 Lumi가 오류 모습이 된다', () => {
    // 왜: 멈춘 화면에서 Lumi 가 계속 기다리는 모습이면 아직 하는 중처럼 보인다 — 실패는 가이드의 error 상태로 알린다.
    const html = card({ busy: false, lumi: 'storyboard' })
    expect(html).toContain('src="/lumi/full/storyboard-error.webp"')
    expect(html).not.toContain('storyboard-loading')
    expect(html).not.toContain('lucide-circle-alert')
  })

  it('Lumi를 주지 않으면 지금처럼 일하는 동안 도는 원, 멈추면 경고 표시가 보인다', () => {
    // 왜: 정상 경로 고정 — Lumi 를 넣지 않은 잠금 화면(그림 다시 그리기 · 샷 고치기 팝업 위 등)은 예전 모습 그대로다.
    const working = card({ busy: true })
    expect(working).toContain('lucide-loader-circle')
    expect(working).not.toContain('/lumi/')
    const stopped = card({ busy: false })
    expect(stopped).toContain('lucide-circle-alert')
    expect(stopped).not.toContain('/lumi/')
  })

  it('Lumi가 기다리는 카드의 진행 막대는 그 Lumi가 입은 단계 색이라, Lumi와 막대가 같은 단계를 말한다', () => {
    // 왜: 시안(Content/Loading Card)의 막대는 그 단계 색 기울기다. 다음 단계 옷을 입은 Lumi 아래 막대가 지금 화면 색이면 두 단계가 섞여 보인다.
    const html = card({ busy: true, lumi: 'storyboard', progress: 40 })
    expect(html).toMatch(cardRoot('data-stage="storyboard"'))
    expect(html).toMatch(/class="[^"]*bg-stage-gradient[^"]*" style="width:40%"/)
  })

  it('화이트 펄이나 완성 옷의 Lumi가 기다리면 카드는 단계 색을 따로 정하지 않고 그 화면의 색을 따른다', () => {
    // 왜: 화이트 펄(시작 · 프로젝트 목록) · 완성 옷에는 단계 색이 없다 — 막대는 놓인 화면의 색(목록이면 크림)으로 남는다.
    for (const lumi of ['pearl', 'complete'] as const) {
      const html = card({ busy: true, lumi, progress: 40 })
      expect(html).toMatch(cardRoot('class='))
      expect(html).not.toMatch(cardRoot('data-stage='))
    }
  })

  it('잠금 화면은 받은 Lumi를 카드에 그대로 넘긴다', () => {
    // 왜: 카드만 Lumi 를 알고 덮개가 넘기지 않으면, 화면이 lumi 를 줘도 도는 원이 보인다.
    const overlay = readFileSync('src/components/ai-busy-overlay.tsx', 'utf8')
    expect(overlay).toMatch(/<AiBusyCard[\s\S]{0,240}lumi=\{lumi\}/)
  })
})
