// 카드 아래 "● 이미지 → ● 영상" 줄 — 가장 좁은 카드(50% 배율 + 채팅 열림)에서도 카드 테두리에 걸리지 않고, 넘치면 줄여 쓴다 (검토 b S1f, 리드 11/14)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('en', text, params) }
})

import { ShotPipelineRow } from '@/features/director/shot-status'

describe('같이 정한 것', () => {
  it('50% + 채팅 열림에서도 그림 아래 "● Image → ● Video" 줄이 카드 테두리에 걸리지 않는다', () => {
    // 왜: 검토 b S1f — 그림 칸 121px(1440 · 한 줄 6장 · 채팅 열림)에서 "Video"가 카드 오른쪽 테두리까지 밀려 걸렸다.
    //   카드 위쪽 줄(S3 · S1d)과 같은 줄여 쓰기 규칙 — 줄은 카드 폭 안에서 끝나고, 넘치면 "…"로 줄이며(마우스를 올리면 온전한 글),
    //   점 · 화살표는 줄지 않는다.
    const row = renderToStaticMarkup(createElement(ShotPipelineRow, { state: 'image_done' }))
    expect(row).toMatch(/^<div class="[^"]*\bmin-w-0\b[^"]*\boverflow-hidden\b/)
    expect(row).toMatch(/<span title="Image" class="[^"]*\bmin-w-0\b[^"]*">.*?<span class="min-w-0 truncate">Image<\/span><\/span>/)
    expect(row).toMatch(/<span title="Video" class="[^"]*\bmin-w-0\b[^"]*">.*?<span class="min-w-0 truncate">Video<\/span><\/span>/)
    expect(row).toMatch(/<span aria-hidden="true" class="[^"]*\bshrink-0\b[^"]*">→<\/span>/)
  })
})
