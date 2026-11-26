// 세로 프로젝트에서도 연출 편집기 그림이 화면 높이 안에 들어오고, 줄인 크기로 그린 화살표가 원래 그림 해상도의 같은 자리에 남는지 검사한다(리드 2026-11-23 QA 본 것 b)
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: vi.fn() }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => url.replace('https://media.test/', '').split('?')[0],
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: vi.fn(),
}))

import { displayToCanvasPoint, editorFrameStyle } from '@/features/writer/directing-arrow-editor'

const editor = () => readFileSync('src/features/writer/directing-arrow-editor.tsx', 'utf8')

describe('연출 편집기 그림 크기', () => {
  // 왜(리드 2026-11-23 · QA 본 것 b): 세로 9:16 복사본에서 편집기 그림이 칸 폭(560px)을 다 써 984px 높이가 되어,
  //   1440×900 화면에서 저장 줄이 그림 아래 487px 를 덮었다(1280×720 은 653px). 높이 상한 = 화면 높이 − 26rem
  //   (창 머리 · 도구 줄 · 저장 줄 · 창 아래 단추 몫 — 1440×900 · 1280×720 · 400 폭에서 잰 값)이 되게 폭을 줄인다.
  it('세로 9:16 프로젝트에서도 연출 편집기 그림은 화면 높이 안에 다 들어오고, 아래 저장 줄이 그림을 덮지 않는다', () => {
    expect(editorFrameStyle({ w: 255, h: 447 })).toEqual({
      aspectRatio: '255 / 447',
      width: 'min(100%, calc(max(12rem, 100dvh - 26rem) * 255 / 447))',
    })
    const src = editor()
    // 그림 칸은 이 규칙 하나로 크기를 정하고, 줄어들면 칸 가운데에 둔다. 저장 줄은 늘 보이게 그대로 붙어 있다.
    expect(src).toMatch(/className="relative mx-auto w-full overflow-hidden rounded-lg border bg-muted"\s*style=\{editorFrameStyle\(dims\)\}/)
    expect(src).toMatch(/className="sticky bottom-0 z-20 flex items-center gap-3 bg-side py-2" data-testid="directing-editor-save-row"/)
  })

  // 왜(혼자 정한 것 a · c): 정사각 그림도 칸 폭을 다 쓰면 같은 일이 생긴다 — 세로와 같이 맞춘다. 화면이 아주 낮아도 그릴 수 있게 12rem 아래로는 줄이지 않는다.
  it('정사각 그림도 세로 그림처럼 화면 높이 안에 맞추고, 화면이 아주 낮아도 12rem 아래로는 줄이지 않는다', () => {
    expect(editorFrameStyle({ w: 1024, h: 1024 })).toEqual({
      aspectRatio: '1024 / 1024',
      width: 'min(100%, calc(max(12rem, 100dvh - 26rem) * 1024 / 1024))',
    })
  })

  // 왜(리드 2026-11-23 · 정상 경로 고정): 가로 16:9 는 지금도 화면 안에 들어온다 — 크기가 바뀌면 안 된다(칸 폭을 다 쓴다).
  it('가로 16:9 연출 편집기 그림은 지금처럼 칸 폭을 다 쓴다', () => {
    expect(editorFrameStyle({ w: 406, h: 223 })).toEqual({ aspectRatio: '406 / 223' })
    expect(editorFrameStyle({ w: 1280, h: 720 })).toEqual({ aspectRatio: '1280 / 720' })
    // 그림을 다 불러오기 전에는 지금처럼 16:9 칸이다.
    expect(editorFrameStyle(null)).toEqual({ aspectRatio: '16 / 9' })
  })

  // 왜(리드 2026-11-23): 그림 칸이 줄어 보여도 위층 캔버스는 원래 그림 해상도다 — 화면 좌표를 비율로 옮겨 그리고,
  //   저장은 위층 캔버스를 그 해상도 그대로 합친다. 그래서 줄인 칸에 그린 화살표도 원래 그림의 같은 자리에 남는다.
  it('줄인 크기로 그린 화살표도 저장하면 원래 그림 해상도의 같은 자리에 남는다', () => {
    const natural = { width: 255, height: 447 }
    // 같은 그림의 같은 자리(가로 50% · 세로 30%)를 줄인 칸(253×443.5)과 큰 칸(560×982)에서 누른다.
    const small = displayToCanvasPoint({ x: 100 + 253 * 0.5, y: 50 + 443.5 * 0.3 }, { left: 100, top: 50, width: 253, height: 443.5 }, natural)
    const large = displayToCanvasPoint({ x: 205 + 560 * 0.5, y: 235 + 982 * 0.3 }, { left: 205, top: 235, width: 560, height: 982 }, natural)
    expect(small.x).toBeCloseTo(127.5, 6)
    expect(small.y).toBeCloseTo(134.1, 6)
    expect(large.x).toBeCloseTo(small.x, 6)
    expect(large.y).toBeCloseTo(small.y, 6)
    const src = editor()
    // 그리기는 이 옮기기를 거치고, 저장은 위층 캔버스 크기(원래 그림 해상도) 그대로 합친다.
    expect(src).toMatch(/return displayToCanvasPoint\(\{ x: e\.clientX, y: e\.clientY \}, canvas\.getBoundingClientRect\(\), canvas\)/)
    expect(src).toMatch(/out\.width = top\.width\s*\n\s*out\.height = top\.height/)
    expect(src).toMatch(/ctx\.drawImage\(top, 0, 0\)/)
  })
})
