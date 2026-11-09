// 영상 길이 읽기는 한 번에 몇 개만 열고, 오래 걸리면 그 영상의 길이 칩을 보이지 않는다 (검토 B 4번, 리드 2026-11-09)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVideoLengthReader } from '@/features/director/hooks/use-video-length'

interface Opened { url: string; done: (seconds: number | null) => void; closed: boolean }
let opened: Opened[]
const url = (n: number) => `https://media.test/${n}.mp4`
const openUrls = () => opened.filter((o) => !o.closed).map((o) => o.url)

function reader() {
  return createVideoLengthReader((target, done) => {
    const handle: Opened = { url: target, done, closed: false }
    opened.push(handle)
    return () => { handle.closed = true }
  }, { limit: 3, timeoutMs: 10_000 })
}

beforeEach(() => {
  vi.useFakeTimers()
  opened = []
})
afterEach(() => {
  vi.useRealTimers()
})

describe('혼자 정한 것', () => {
  // 왜: 화면 맞추기로 캔버스 전체를 보면 다 만든 영상 노드가 한꺼번에 보여, 숨은 영상 파일을 수십 개 한꺼번에 열었다(검토 B 4번).
  it('영상 길이는 한 번에 세 개까지만 읽고 나머지는 차례를 기다린다', () => {
    const lengths = reader()
    for (const n of [1, 2, 3, 4, 5]) lengths.request(url(n))
    expect(openUrls()).toEqual([url(1), url(2), url(3)])

    opened[0]!.done(5)

    expect(lengths.get(url(1))).toBe(5)
    expect(openUrls()).toEqual([url(2), url(3), url(4)])
  })

  // 왜: 답이 없는 파일이 줄을 막지 않게 하고, 길이를 짐작해 틀린 값을 보이지 않는다(검토 B 4번 "10초 넘으면 없음").
  it('영상 길이를 10초 안에 못 읽으면 길이 칩을 보이지 않고 다음 영상을 읽는다', () => {
    const lengths = reader()
    for (const n of [1, 2, 3, 4]) lengths.request(url(n))

    vi.advanceTimersByTime(10_000)

    expect(lengths.get(url(1))).toBeNull()
    expect(opened.slice(0, 3).every((o) => o.closed)).toBe(true)
    expect(openUrls()).toEqual([url(4)])
  })

  // 왜: 정상 경로 고정. 같은 영상 노드가 다시 그려지거나 화면을 옮겨도 같은 파일을 또 열지 않는다(읽지 못한 것도 다시 열지 않는다).
  it('영상 길이는 주소마다 한 번만 읽는다', () => {
    const lengths = reader()
    lengths.request(url(1))
    lengths.request(url(1))
    opened[0]!.done(null)
    lengths.request(url(1))

    expect(opened).toHaveLength(1)
    expect(lengths.get(url(1))).toBeNull()
  })
})
