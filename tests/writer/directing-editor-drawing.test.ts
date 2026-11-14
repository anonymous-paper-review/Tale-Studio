// 연출 화살표 편집기에 그리던 위층(펜 · 지우개 자국 · 되돌리기)이 연출 그림이 그대로일 때 남는지 검사한다(2026-11-14 재검토 c 3)
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: vi.fn() }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => url.replace('https://media.test/', '').split('?')[0],
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: vi.fn(),
}))

import { reloadsTopLayer } from '@/features/writer/directing-arrow-editor'
import { mergeRoughFrame } from '@/lib/writer/directing-edit'

// 이 시험을 위해 지은 러프 — 편집기는 처음 열 때 연출 그림(주소, ?v= 포함)을 위층으로 깔았다.
const rough = {
  status: 'completed',
  generatedAt: 100,
  frames: { start: 'https://media.test/s.png?v=1', direction: 'https://media.test/d.png?v=1', end: 'https://media.test/e.png?v=1' },
}
const loaded = rough.frames.direction

describe('연출 편집기 위층', () => {
  // 왜: 같은 창 세 장 줄에서 시작 · 끝만 다시 그리면 그림 시각만 바뀐다. 예전 편집기는 그림 시각이 바뀌면 위층을 다시 깔아
  //   저장 전에 그린 펜 · 지우개 자국과 되돌리기가 사라졌다 — 오너가 본 "미들 프레임이 안 된다"일 수 있다(재검토 c 3).
  it('시작 · 끝만 다시 그려도 연출 편집기에 그리던 화살표는 남는다', () => {
    const afterEnd = mergeRoughFrame(rough, 'end', 'https://media.test/e.jpg?v=2', 200)
    const afterStart = mergeRoughFrame(afterEnd, 'start', 'https://media.test/s.jpg?v=3', 300)
    expect(reloadsTopLayer(loaded, afterEnd.frames?.direction)).toBe(false)
    expect(reloadsTopLayer(loaded, afterStart.frames?.direction)).toBe(false)
  })

  // 왜: 정상 경로 고정 — 처음 열 때, 연출 그림을 다시 만들거나 [저장]하면(주소가 바뀜) 위층을 지금 연출 그림으로 다시 깐다.
  it('처음 열거나 연출 그림이 바뀌면 편집기 위층은 지금 연출 그림으로 다시 깐다', () => {
    expect(reloadsTopLayer(null, loaded)).toBe(true)
    const remade = mergeRoughFrame(rough, 'direction', 'https://media.test/d.jpg?v=2', 200)
    expect(reloadsTopLayer(loaded, remade.frames?.direction)).toBe(true)
  })
})
