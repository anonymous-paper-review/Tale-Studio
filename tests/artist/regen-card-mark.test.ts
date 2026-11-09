// 작품 스타일을 다시 그리는 동안 Artist 카드마다 새로 그렸어요 · 그리는 중 · 순서 기다리는 중을 보인다(11/5 시안 AR)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { regenCardMark, type RegenSlotState } from '@/lib/artist/style-versions'
import { RegenCardMark } from '@/features/artist/card-parts'
import { useLocaleStore } from '@/stores/locale-store'

const MINHO = { kind: 'character' as const, id: 'minho', appearanceKey: 'current' }
const MINHO_YOUNG = { kind: 'character' as const, id: 'minho', appearanceKey: 'young' }
const HALL = { kind: 'location' as const, id: 'hall', appearanceKey: null }
const HALL_NIGHT = { kind: 'location' as const, id: 'hall', appearanceKey: 'night' }

/** 정적 렌더는 스토어의 처음 값을 읽는다 — 화면 언어를 바꾼 뒤 처음 값으로 옮겨 그린다(style-version-screen 과 같은 방법). */
function setRenderLocale(locale: 'ko' | 'en') {
  useLocaleStore.setState({ locale })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
}

function running(states: Record<string, RegenSlotState>, opts: { complete?: boolean; stopped?: boolean } = {}) {
  return { regen: { complete: opts.complete ?? false, states }, stopped: opts.stopped ?? false }
}

describe('다시 그리는 동안 카드 표시', () => {
  it('다시 그리는 동안 새 스타일로 다 그린 칸의 카드는 "새로 그렸어요"를 보인다', () => {
    // 왜: 11/5 시안 AR — 여러 장을 다시 그리는 동안 어느 카드가 끝났는지 카드에서 바로 본다.
    expect(regenCardMark(running({ 'c:minho:current': 'done' }), MINHO)).toBe('new')
  })

  it('다시 그리는 동안 지금 그리고 있는 칸의 카드는 "그리는 중"을 보인다', () => {
    // 왜: 11/5 시안 AR — 지금 어느 카드를 그리는지 카드에서 바로 본다.
    expect(regenCardMark(running({ 'c:minho:current': 'drawing' }), MINHO)).toBe('drawing')
  })

  it('다시 그리는 동안 아직 차례가 오지 않은 칸의 카드는 "순서 기다리는 중"을 보인다', () => {
    // 왜: 11/5 시안 AR — 다른 모습은 기본 모습이 끝난 뒤에 그려서, 한동안 그대로인 카드가 멈춘 것처럼 보이지 않게.
    expect(regenCardMark(running({ 'c:minho:current': 'drawing', 'c:minho:young': 'todo' }), MINHO_YOUNG)).toBe('waiting')
  })

  it('그리지 못한 칸의 카드는 다시 그리기 표시 없이 지금 모습 그대로다', () => {
    // 왜: 리드 2026-11-09 — 실패한 칸은 지금 모습 그대로 둔다. 못 그린 수와 [남은 그림 다시 그리기]는 머리 줄이 따로 알린다.
    expect(regenCardMark(running({ 'c:minho:current': 'failed' }), MINHO)).toBeNull()
  })

  it('다시 그리기가 멈추면 아직 안 그린 칸의 카드에 "순서 기다리는 중"을 보이지 않는다', () => {
    // 왜: 멈춘 뒤에는 [남은 그림 다시 그리기]를 눌러야 그린다 — 차례를 기다린다고 보이면 거짓이다(한도에 막혀 멈춘 때 · 화면을 다시 연 때).
    const stopped = running({ 'c:minho:current': 'done', 'c:minho:young': 'todo' }, { stopped: true })
    expect(regenCardMark(stopped, MINHO_YOUNG)).toBeNull()
    expect(regenCardMark(stopped, MINHO)).toBe('new')
  })

  it('다시 그리기가 다 끝났거나 없으면 카드에 다시 그리기 표시가 없다', () => {
    // 왜: 정상 경로 고정 — 다 그린 뒤에는 보통 카드로 돌아간다.
    expect(regenCardMark(running({ 'c:minho:current': 'done' }, { complete: true }), MINHO)).toBeNull()
    expect(regenCardMark({ regen: null, stopped: false }, MINHO)).toBeNull()
  })

  it('이번 다시 그리기에 들지 않은 칸의 카드는 표시가 없다', () => {
    // 왜: 정상 경로 고정 — 브레이크다운에서 올린 그림을 그대로 쓰는 칸은 다시 그리지 않는다(2026-10-31 오너 결정 C).
    expect(regenCardMark(running({ 'l:hall:default': 'drawing' }), MINHO)).toBeNull()
  })

  it('배경 카드가 기본 모습을 보이면 기본 배경 칸의 상태를, 다른 모습을 보이면 그 모습 칸의 상태를 본다', () => {
    // 왜: 배경 카드는 고른 모습 그림 한 장을 보인다 — 보이는 그림과 다른 칸의 상태를 붙이면 안 된다.
    const states = { 'l:hall:default': 'done', 'l:hall:night': 'todo' } as const
    expect(regenCardMark(running(states), HALL)).toBe('new')
    expect(regenCardMark(running(states), HALL_NIGHT)).toBe('waiting')
  })

  it('카드 위 표시는 한국어 화면에서 "새로 그렸어요" · "그리는 중…" · "순서 기다리는 중"으로, 영어 화면에서 같은 뜻으로 보인다', () => {
    // 왜: 11/5 시안 AR 문구 그대로. 칸 안 진행 막대는 진짜 진행률이 없어 두지 않는다(리드 2026-11-09).
    setRenderLocale('ko')
    expect(renderToStaticMarkup(createElement(RegenCardMark, { mark: 'new' }))).toContain('새로 그렸어요')
    expect(renderToStaticMarkup(createElement(RegenCardMark, { mark: 'drawing' }))).toContain('그리는 중…')
    expect(renderToStaticMarkup(createElement(RegenCardMark, { mark: 'waiting' }))).toContain('순서 기다리는 중')
    expect(renderToStaticMarkup(createElement(RegenCardMark, { mark: null }))).toBe('')
    setRenderLocale('en')
    expect(renderToStaticMarkup(createElement(RegenCardMark, { mark: 'new' }))).toContain('Redrawn')
    expect(renderToStaticMarkup(createElement(RegenCardMark, { mark: 'waiting' }))).toContain('Waiting for its turn')
  })

  it('인물 카드와 배경 카드 둘 다 그림 위에 다시 그리기 표시를 둔다', () => {
    // 왜: 한쪽 카드만 표시가 있으면 그 종류만 다시 그리는 것처럼 보인다.
    for (const file of ['src/features/artist/character-panel.tsx', 'src/features/artist/world-panel.tsx']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/<RegenCardMark mark=\{regenMark\} \/>/)
    }
  })
})
