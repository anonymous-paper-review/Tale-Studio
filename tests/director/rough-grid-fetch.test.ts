// 실사 시트에 붙일 러프 그림은 한 장씩이 아니라 한꺼번에 내려받는다 (오너 제보 2026-10-10 "중간에 끊김")
import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { composeRoughReferenceGrid } from '@/lib/director/storyboard-strip'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('실사 시트의 러프 그림 받기', () => {
  it('시트 한 장에 붙일 러프 그림 12장은 한꺼번에 내려받는다', async () => {
    // 왜: 한 장씩 받느라 시트마다 10초 넘게 걸렸다 — 시트 2장을 내는 요청이 60초 제한에 걸려 판 전체가 멈췄다(10/9 · 10/10 운영 6번 중 4번).
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 200, b: 200 } } }).png().toBuffer()
    const waiting: Array<() => void> = []
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => waiting.push(() => resolve(new Response(new Uint8Array(png))))))
    vi.stubGlobal('fetch', fetchMock)
    const frames = Array.from({ length: 4 }, (_, i) => ({ start: `https://r/${i}/s.png`, direction: `https://r/${i}/d.png`, end: `https://r/${i}/e.png` }))

    const composing = composeRoughReferenceGrid(frames, null)
    // 한 장도 받기 전에 12장을 모두 요청해야 한다 — 한 장씩 받으면 첫 장을 기다리느라 1장에서 멈춘다.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(12), { timeout: 500 })
    for (const release of waiting) release()
    const sheet = await composing
    expect((await sharp(sheet).metadata()).format).toBe('png')
  })
})
