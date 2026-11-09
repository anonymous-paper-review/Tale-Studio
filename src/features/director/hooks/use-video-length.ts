'use client'

// 영상 파일의 실제 길이(초)를 브라우저가 파일 머리(metadata)만 읽어 알려 준다(11/5 시안 DG "▶ 0:05", 리드 2026-11-09 c2).
//   주소마다 한 번만 읽고 기억한다. 못 읽으면(만료 · 모르는 형식) null 이고, 길이를 짐작해 채우지 않는다.
//   한 번에 몇 개만 열고 나머지는 줄을 세우며, 오래 걸리면 포기한다(검토 B 4번): 화면 맞추기로 캔버스 전체를 보면
//   다 만든 영상 노드가 한꺼번에 보여 숨은 video 를 수십 개 한꺼번에 열었다. 약속: tests/director/video-length-reader.test.ts
import { useEffect, useSyncExternalStore } from 'react'

/** 한 번에 여는 영상 수와 기다리는 시간. 넘으면 그 영상은 길이 없음(칩 안 보임). */
const READ_LIMIT = 3
const READ_TIMEOUT_MS = 10_000

/** 파일 하나를 열어 길이를 읽기 시작한다. 끝나면 done(초 또는 null), 돌려준 함수는 연 것을 닫는다. */
export type OpenVideo = (url: string, done: (seconds: number | null) => void) => () => void

export function createVideoLengthReader(open: OpenVideo, { limit, timeoutMs }: { limit: number; timeoutMs: number }) {
  const lengths = new Map<string, number | null>()
  const waiting: string[] = []
  const reading = new Set<string>()
  const listeners = new Set<() => void>()

  const pump = () => {
    while (reading.size < limit && waiting.length > 0) {
      const url = waiting.shift()!
      reading.add(url)
      let settled = false
      let close = () => {}
      const settle = (seconds: number | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        close()
        reading.delete(url)
        lengths.set(url, seconds !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : null)
        for (const listener of listeners) listener()
        pump()
      }
      const timer = setTimeout(() => settle(null), timeoutMs)
      close = open(url, settle)
      // 여는 쪽이 바로 끝냈으면(이미 아는 파일 등) 방금 받은 닫기를 한 번 더 부른다.
      if (settled) close()
    }
  }

  return {
    request(url: string) {
      if (lengths.has(url) || reading.has(url) || waiting.includes(url)) return
      waiting.push(url)
      pump()
    },
    /** 읽은 길이(초) · 못 읽음(null) · 아직 모름(undefined). */
    get(url: string): number | null | undefined {
      return lengths.get(url)
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** 브라우저에서 영상 파일의 머리만 여는 방법: 화면에 붙이지 않는 video 하나. */
const openInBrowser: OpenVideo = (url, done) => {
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  const onLoaded = () => done(video.duration)
  const onError = () => done(null)
  video.addEventListener('loadedmetadata', onLoaded, { once: true })
  video.addEventListener('error', onError, { once: true })
  video.src = url
  return () => {
    video.removeEventListener('loadedmetadata', onLoaded)
    video.removeEventListener('error', onError)
    video.removeAttribute('src')
    video.load()
  }
}

const reader = createVideoLengthReader(openInBrowser, { limit: READ_LIMIT, timeoutMs: READ_TIMEOUT_MS })

export function useVideoLength(url: string | null): number | null {
  const seconds = useSyncExternalStore(reader.subscribe, () => (url ? reader.get(url) ?? null : null), () => null)
  useEffect(() => {
    if (url) reader.request(url)
  }, [url])
  return seconds
}
