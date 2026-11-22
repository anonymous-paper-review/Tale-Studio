// 샷 고치기 창 왼쪽 큰 그림이 세로(9:16) · 정사각 러프도 잘리지 않고 다 보이고, 가로 16:9 는 지금과 같은지 검사한다 (리드 2026-11-23 QA ③)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: vi.fn() }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => url.replace('https://media.test/', '').split('?')[0],
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: vi.fn(),
}))

import { ShotEditBigFrame, frameDimsFromFormat } from '@/features/writer/shot-edit-big-frame'
import { editorFrameStyle } from '@/features/writer/directing-arrow-editor'
import type { ProjectFormat } from '@/types/project'

const URL_START = 'https://media.test/proj/rough/sh_05_start.png'
const render = (format: ProjectFormat | null, url: string | null = URL_START) =>
  renderToStaticMarkup(createElement(ShotEditBigFrame, { url, generatedAt: 1, caption: '시작', format, emptyLabel: '아직 그리지 않았어요' }))
const frameTag = (html: string) => html.match(/<div[^>]*data-testid="shot-edit-big-frame"[^>]*>/)?.[0] ?? ''

describe('샷 고치기 창 큰 그림', () => {
  it('세로 9:16 러프도 샷 고치기 창의 큰 그림 칸에서 잘리지 않고 다 보인다', () => {
    // 왜(리드 2026-11-23 QA ③): 오너 실제 프로젝트(세로)에서 큰 그림 칸이 창 왼쪽 줄에 눌려(그림 칸만 최소 높이가 0 이었다) 늘 윗부분만 보였다.
    //   칸은 눌리지 않고(shrink-0) 그림 비율을 따르며, 화면 높이 안에 들도록 폭을 줄여 가운데 둔다. 그림은 칸 안에 다 들어간다(object-contain).
    const html = render('vertical_9:16')
    const tag = frameTag(html)
    expect(tag).toContain('shrink-0')
    expect(tag).toContain('aspect-ratio:9 / 16')
    expect(tag).toContain('width:min(100%, calc(max(12rem, 100dvh - 26rem) * 9 / 16))')
    expect(html).toMatch(/<img[^>]*class="[^"]*object-contain/)
    expect(html).not.toContain('object-cover')
  })

  it('세로 · 정사각 큰 그림 칸은 연출 편집기 칸과 같은 크기 규칙이라 시작 · 연출 탭을 오가도 그림 크기가 같다', () => {
    // 왜(혼자 정한 것): 두 탭의 그림 칸 크기가 다르면 탭을 바꿀 때마다 그림이 커졌다 작아졌다 한다(연출 편집기 칸은 리드 QA 본 것 b 로 이미 화면 높이 안에 맞춘다).
    for (const format of ['vertical_9:16', 'square_1:1'] as const) {
      const style = editorFrameStyle(frameDimsFromFormat(format))
      expect(frameTag(render(format)), format).toContain(`width:${style.width}`)
    }
  })

  it('가로 16:9 큰 그림은 지금처럼 칸 폭을 다 쓴다', () => {
    // 왜: 정상 경로 고정 — 가로 러프는 지금도 다 보인다. 화면 비율을 모르는 옛 프로젝트도 지금처럼 16:9 칸이다.
    for (const format of ['horizontal_16:9', null] as const) {
      const tag = frameTag(render(format))
      expect(tag, String(format)).toContain('w-full')
      expect(tag, String(format)).toContain('aspect-ratio:16 / 9')
      expect(tag, String(format)).not.toContain('width:min(')
    }
  })

  it('그림을 불러오기 전에는 프로젝트 화면 비율로 칸을 잡아, 그림이 뜰 때 칸이 튀지 않는다', () => {
    // 왜(혼자 정한 것): 칸을 늘 16:9 로 잡았다가 세로 그림이 뜨면 칸 모양이 바뀌며 창이 덜컥인다. 다 불러오면 그 그림의 실제 비율을 따른다.
    expect(frameDimsFromFormat('vertical_9:16')).toEqual({ w: 9, h: 16 })
    expect(frameDimsFromFormat('square_1:1')).toEqual({ w: 1, h: 1 })
    expect(frameDimsFromFormat('horizontal_16:9')).toEqual({ w: 16, h: 9 })
    expect(frameDimsFromFormat('cinema_2.39:1')).toEqual({ w: 2.39, h: 1 })
    expect(frameDimsFromFormat(null)).toBeNull()
  })

  it('아직 러프가 없으면 같은 칸에 "아직 그리지 않았어요"가 보인다', () => {
    // 왜: 정상 경로 고정 — 빈 칸 안내는 그대로다(세로 프로젝트면 칸도 세로).
    const html = render('vertical_9:16', null)
    expect(html).toContain('아직 그리지 않았어요')
    expect(html).not.toContain('<img')
    expect(frameTag(html)).toContain('aspect-ratio:9 / 16')
  })

  it('샷 고치기 창의 큰 그림(시작 · 연출 장)은 이 칸으로 그린다', () => {
    // 왜: 정상 경로 고정 — 창 안에 예전 칸(폭만 맞추고 높이는 눌리던 칸)이 남으면 세로 그림이 다시 잘린다.
    const src = readFileSync('src/features/writer/storyboard-shot-dialog.tsx', 'utf8')
    expect(src).toMatch(/<ShotEditBigFrame/)
    expect(src).not.toContain('className="block h-auto w-full"')
  })
})
