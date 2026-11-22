// Cinema 샷 줄의 지금 이미지 판이 Director 노드와 같은 판정 · 같은 말로 "러프 바뀜" 이름표를 다는지 검사한다 (fb-end QA 4 · 리드 2026-11-23)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 화면 말 — 서버 그리기는 스토어의 처음 값(영어)을 읽으므로 번역 훅을 직접 고른 말로 돌린다(scene-buttons 시험과 같은 방법).
const lang = vi.hoisted(() => ({ locale: 'ko' as 'ko' | 'en' }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate(lang.locale, text, params) }
})

import { HistoryCard } from '@/features/camera/history-card'
import type { HistoryEntry } from '@/features/camera/shot-history'

const image = (current: boolean): HistoryEntry => ({
  kind: 'image',
  id: 'v1',
  n: 1,
  at: 1,
  current,
  used: current,
  summary: [],
  version: { id: 'v1', url: 'https://media.test/s.png', generatedAt: 1, source: 'generated' } as never,
})
const draw = (entry: HistoryEntry, roughChanged: boolean) =>
  renderToStaticMarkup(createElement(HistoryCard, { entry, shotNodeId: 'n1', shotName: '샷 1', writerShotId: 'w1', activeJobs: [], roughChanged }))
const row = () => readFileSync('src/features/camera/shot-row.tsx', 'utf8')

beforeEach(() => {
  lang.locale = 'ko'
})

describe('같이 정한 것(리드 11/23)', () => {
  it('실사를 그린 뒤 러프가 바뀌었으면 Cinema 샷 줄의 지금 이미지 판에 Director 노드와 같은 "러프 바뀜" 이름표가 붙는다', () => {
    // 왜: 연출 장을 고치고 끝 장을 다시 그리면 Director 노드에는 "러프 바뀜"이 뜨는데 Cinema 에는 없었다(fb-end QA 4). 영상은 Cinema 에서 만든다.
    expect(draw(image(true), true)).toContain('러프 바뀜')
    expect(draw(image(true), false)).not.toContain('러프 바뀜')
    lang.locale = 'en'
    expect(draw(image(true), true)).toContain('Rough changed')
    // 판정은 Director 노드와 같은 함수 · 같은 재료(Writer 샷의 러프 · 샷의 지금 실사), 이름표도 Director 와 같은 조각이다.
    expect(row()).toMatch(/const rough = useRoughStoryboard\(writerShotId\)/)
    expect(row()).toMatch(/const roughChanged = classifyRoughChanged\(rough, data\?\.storyboardImage\)/)
    expect(readFileSync('src/features/camera/history-card.tsx', 'utf8')).toMatch(/<RoughChangedTag /)
  })
})

describe('혼자 정한 것(되돌리기 쉬움)', () => {
  it('"러프 바뀜"은 지금 이미지 판에만 붙고 옛 이미지 판 · Take 판에는 붙지 않는다', () => {
    // 왜: 판정 재료가 샷의 지금 실사라 옛 판에는 맞지 않는다 — Director 노드도 지금 그림에만 붙인다. 자리는 Director 노드처럼 그림 오른쪽 위.
    expect(row()).toMatch(/roughChanged=\{roughChanged && entry\.kind === 'image' && entry\.current\}/)
    expect(draw(image(false), false)).not.toContain('러프 바뀜')
  })
})
