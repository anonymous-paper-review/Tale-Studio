// 스토리보드 카드 위쪽 줄 — 좁은 카드(50% 배율 · 한 줄 6장 · 채팅 열림)에서도 꼬리표("이미지 필요" · "러프 바뀜" · 러프 보기 단계 꼬리표)와 ⤢ 상세 단추가 겹치지 않는다 (영어 재점검 qa-golden S3 · 검토 b S1d, 리드 11/14)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('en', text, params) }
})

import { ImageNeededTag, RoughChangedTag } from '@/features/director/shot-status'

const grid = () => readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')
const PREVIZ_ROW = "{mediaMode === 'previz' && !generating && stageBadge && ("
const between = (text: string, start: string, end: string) => {
  const from = text.indexOf(start)
  const to = text.indexOf(end, from)
  expect(from).toBeGreaterThanOrEqual(0)
  expect(to).toBeGreaterThan(from)
  return text.slice(from, to)
}

describe('같이 정한 것', () => {
  it('스토리보드 50% 배율에서도 "Image needed" 꼬리표와 ⤢ 상세 단추가 겹치지 않는다', () => {
    // 왜: 영어 재점검 S3 — 한 줄 6장(가장 작은 배율)에서 "Image ne⤢ Details"로 겹쳤다(한국어 "이미지 필요"도 같은 자리).
    const src = grid()
    // 그림 칸이 크기를 재는 틀이고, 좁으면 ⤢ 단추는 글자 없이 그림표만 — 이름은 화면 읽기 이름(aria-label)이 말한다.
    expect(src).toContain("'@container relative overflow-hidden rounded-[14px] bg-art-placeholder'")
    expect(src).toMatch(/<Maximize2 className="size-3 shrink-0" \/>\s*<span className="hidden @min-\[15rem\]:inline">\{t\('Details'\)\}<\/span>/)
    expect(src).toMatch(/aria-label=\{t\('Open details'\)\}/)
    // 꼬리표 줄은 ⤢ 단추 자리 앞에서 끝나고(좁을 때 · 넓을 때 단추 폭에 맞춰), 넘치면 줄여 쓴다.
    expect(src).toContain('absolute left-9 right-9 top-2 z-10 flex min-w-0 items-center gap-1 overflow-hidden @min-[15rem]:right-[5.5rem]')
    const tag = renderToStaticMarkup(createElement(ImageNeededTag))
    expect(tag).toContain('min-w-0')
    expect(tag).toMatch(/<span class="[^"]*truncate[^"]*">Image needed<\/span>/)
    expect(tag).toContain('title="Image needed"')
  })

  it('카드 위쪽 줄의 다른 꼬리표("Rough changed" · 러프 보기 단계 꼬리표 "Rough needed" · "Previz")도 ⤢ 단추와 겹치지 않고, 넘치면 "…"로 줄인다(마우스를 올리면 온전한 글)', () => {
    // 왜: 검토 b S1d — "Rough changed"는 줄여 쓰기가 없어 "…" 없이 잘렸고, 러프 보기 단계 꼬리표는 오른쪽 끝이 없어
    //   그림 칸이 140px 쯤(한 줄 6장 + 채팅 열림)이면 그림표만 남은 ⤢ 와 겹칠 셈이었다.
    const src = grid()
    // 실사 보기 줄: "Rough changed"도 "Image needed"와 같은 꼬리표 규칙.
    expect(src).toContain('{roughChanged && <RoughChangedTag />}')
    const tag = renderToStaticMarkup(createElement(RoughChangedTag))
    expect(tag).toContain('min-w-0')
    expect(tag).toMatch(/<span class="[^"]*truncate[^"]*">Rough changed<\/span>/)
    expect(tag).toContain('title="Rough changed"')
    // 러프 보기 줄: S3 와 같은 자리(⤢ 단추 앞에서 끝남) · 넘치면 줄여 씀 · 온전한 글은 마우스를 올리면.
    const previz = between(src, PREVIZ_ROW, '{/* 액션 목록')
    expect(previz).toContain('absolute left-9 right-9 top-2 z-10 @min-[15rem]:right-[5.5rem]')
    expect(previz).toContain('flex min-w-0 items-center gap-1 overflow-hidden')
    expect(previz).toContain('title={stageBadge.label}')
    expect(previz).toContain('<span className="min-w-0 truncate">{stageBadge.label}</span>')
    expect(previz).toContain('{roughChanged && <RoughChangedTag className="pointer-events-auto" />}')
    expect(src).not.toContain('absolute left-10 top-2')
  })
})

describe('혼자 정한 것', () => {
  it('러프 보기 꼬리표 위에 마우스를 올리면 지금처럼 동작 목록이 열리고, 줄여 쓰는 줄이 그 목록을 자르지 않는다', () => {
    // 왜: 꼬리표 줄을 넘침 자르기로 바꾸면 줄 아래로 펼쳐지는 동작 목록까지 잘린다 — 목록은 자르는 줄 밖에 둔다.
    //   줄이 ⤢ 앞까지 넓어져도 빈 자리는 마우스를 받지 않아, 목록은 지금처럼 꼬리표 위에서만 열린다(#e1 2026-08-12).
    const block = between(grid(), PREVIZ_ROW, '{/* 생성 중 — border beam')
    // 바깥 틀(마우스 안 받음) → 자르는 줄(꼬리표) → 그 밖의 동작 목록 순서.
    const outer = block.indexOf('group/badge pointer-events-none absolute left-9')
    const row = block.indexOf('flex min-w-0 items-center gap-1 overflow-hidden')
    const list = block.indexOf('pointer-events-none absolute left-0 top-full')
    expect(outer).toBeGreaterThanOrEqual(0)
    expect(row).toBeGreaterThan(outer)
    expect(list).toBeGreaterThan(row)
    expect(block.slice(row, list)).toMatch(/<\/div>\s*\{\/\* 액션 목록/)
    // 꼬리표만 마우스를 받고, 목록은 꼬리표에 올렸을 때 받는다.
    expect(block).toContain("'pointer-events-auto inline-flex min-w-0 items-center gap-1")
    expect(block).toContain('group-hover/badge:pointer-events-auto group-hover/badge:opacity-100')
  })
})
