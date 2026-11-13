// 스토리보드 카드 위쪽 줄 — 좁은 카드(50% 배율 · 한 줄 6장)에서도 "이미지 필요" 꼬리표와 ⤢ 상세 단추가 겹치지 않는다 (영어 재점검 qa-golden S3, 리드 11/14)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('en', text, params) }
})

import { ImageNeededTag } from '@/features/director/shot-status'

const grid = () => readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')

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
})
