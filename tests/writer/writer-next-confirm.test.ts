// Writer 에서 고친 것을 적용한 뒤 다음 단계를 묻는 자리는 단계 확인 단추 「좋아요, 그림 그리기로」 · 「아니요, 더 고칠래요」다(11/5 시안, 오너 2026-11-09 결정 1)
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WriterNextCard } from '@/features/prose/writer-next-card'
import { StageConfirm } from '@/components/controls/stage-confirm'
import { useLocaleStore } from '@/stores/locale-store'

function render() {
  useLocaleStore.setState({ locale: 'ko' })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
  return renderToStaticMarkup(createElement(WriterNextCard, { step: 'ask' }))
}

afterEach(() => {
  useLocaleStore.setState({ locale: 'en' })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
})

describe('Writer 다음 단계 묻기', () => {
  it('고친 것을 적용한 뒤 다음 단계를 물을 때 「좋아요, 그림 그리기로」 · 「아니요, 더 고칠래요」 단계 확인 단추를 보인다', () => {
    // 왜: 11/5 시안 단계 확인 단추 — "다음 단계로" 대신 다음 단계에서 하는 일(그림 그리기)을 말한다. 누르면 하는 일은 그대로(산문 확정 · 할 일 보기).
    const out = render()
    expect(out).toContain('data-testid="writer-next-ask"')
    expect(out).toContain('좋아요, 그림 그리기로')
    expect(out).toContain('아니요, 더 고칠래요')
    expect(out).toContain('data-next="artist"')
  })

  it('단계 확인 단추를 눌러도 하는 일은 지금과 같다 — 왼쪽은 산문 확정, 오른쪽은 할 일 보기', () => {
    // 왜: 정상 경로 고정 — 모양만 시안으로 바꿨다(오너 2026-11-09 "동작은 지금 그대로").
    const card = readFileSync('src/features/prose/writer-next-card.tsx', 'utf8')
    expect(card).toMatch(/<StageConfirm[\s\S]*?stage="producer"[\s\S]*?tone="chat"/)
    expect(card).toMatch(/onConfirm=\{\(\) => void confirm\.run\(\)\}/)
    expect(card).toMatch(/onRevise=\{\(\) => useGlobalChatStore\.getState\(\)\.offerWriterNext\('more'\)\}/)
  })

  it('산문을 확정하는 동안 단계 확인 단추는 도는 표시를 보이고 다시 누를 수 없다', () => {
    // 왜: 검토 C2 #4 — 「좋아요, 그림 그리기로」를 누르면 산문 확정(서버 1초 남짓) 동안 단추가 흐려지기만 해서 눌렸는지 몰랐다.
    const card = readFileSync('src/features/prose/writer-next-card.tsx', 'utf8')
    expect(card).toMatch(/<StageConfirm[\s\S]*?busy=\{confirm\.busy\}[\s\S]*?\/>/)
    useLocaleStore.setState({ locale: 'ko' })
    Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
    const busy = renderToStaticMarkup(createElement(StageConfirm, { stage: 'producer', tone: 'chat', busy: true, onConfirm: () => {}, onRevise: () => {} }))
    const [confirm, revise] = busy.match(/<button[^>]*>/g) ?? []
    expect(confirm).toMatch(/\bdisabled=""/)
    expect(confirm).toMatch(/aria-busy="true"/)
    expect(revise).toMatch(/\bdisabled=""/)
    expect(busy).toMatch(/<button[^>]*data-next="artist"[^>]*>(?:(?!<\/button>)[\s\S])*lucide-loader-circle/)
    const idle = renderToStaticMarkup(createElement(StageConfirm, { stage: 'producer', tone: 'chat', onConfirm: () => {}, onRevise: () => {} }))
    expect(idle).not.toContain('lucide-loader-circle')
    expect(idle).not.toMatch(/\bdisabled=""/)
  })
})
