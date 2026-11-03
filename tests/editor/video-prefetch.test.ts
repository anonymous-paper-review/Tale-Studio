// "전체 보기" · 드래프트 렌더가 영상을 미리 받을 때 받기 하나가 멈춰도 끝나고, 취소하면 바로 멈추는지 검사한다 (QA 2026-11-03 밤 오너 "Editor에서 무한 로딩")
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREFETCH_TIMEOUT_MS, cachedVideoUrl, prefetchVideos } from '@/features/editor/video-prefetch'

/** 끝나지 않는 받기 — 중단 신호를 받아야만 끝난다(브라우저 fetch 와 같다). */
function hangingFetch(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) =>
    url.includes('stuck') ? hangingFetch(url, init) : Promise.resolve(new Response(new Blob(['video']), { status: 200 })),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('영상 미리 받기는 끝난다', () => {
  it('한 영상을 60초 안에 받지 못하면 그 영상은 건너뛰고(그 클립은 스트리밍) 나머지를 받아 끝난다', async () => {
    // 왜: 받기 하나가 멈추면 "전체 보기"의 "준비 중 n/m…" · 드래프트 렌더의 "클립 준비 중"이 끝나지 않았다. 고장: 저장소 연결이 멈춘 때.
    vi.useFakeTimers()
    const done = prefetchVideos('project-timeout', ['https://video.test/stuck.mp4', 'https://video.test/ok.mp4'])
    await vi.advanceTimersByTimeAsync(PREFETCH_TIMEOUT_MS)
    await expect(done).resolves.toEqual({ failed: 1, total: 2 })
    expect(PREFETCH_TIMEOUT_MS).toBe(60_000)
    expect(cachedVideoUrl('https://video.test/ok.mp4')).toBeTruthy()
    expect(cachedVideoUrl('https://video.test/stuck.mp4')).toBeNull()
  })

  it('드래프트 렌더를 취소하면 미리 받기도 바로 멈추고 남은 영상은 받지 않는다', async () => {
    // 왜: 취소를 눌러도 미리 받기가 다 끝날 때까지 "클립 준비 중"이 남았다 — 미리 받기가 취소 신호를 몰랐다.
    const urls = Array.from({ length: 10 }, (_, i) => `https://video.test/stuck-${i}.mp4`)
    const cancel = new AbortController()
    const done = prefetchVideos('project-cancel', urls, undefined, { signal: cancel.signal })
    cancel.abort()
    await expect(done).resolves.toMatchObject({ total: 10 })
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4)
    expect(readFileSync('src/lib/editor-draft-render.ts', 'utf8')).toMatch(/await prefetchVideos\(opts\.projectId, remoteUrls, [\s\S]{0,200}\{ signal \}\)/)
  })
})
