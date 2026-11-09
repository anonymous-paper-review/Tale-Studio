'use client'

// 영상 파일의 실제 길이(초)를 브라우저가 파일 머리(metadata)만 읽어 알려 준다(11/5 시안 DG "▶ 0:05", 리드 2026-11-09 c2).
//   주소마다 한 번만 읽고 기억한다. 못 읽으면(만료 · 모르는 형식) null 이고, 길이를 짐작해 채우지 않는다.
import { useEffect, useSyncExternalStore } from 'react'

const lengths = new Map<string, number | null>()
const reading = new Set<string>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function read(url: string): void {
  if (lengths.has(url) || reading.has(url) || typeof document === 'undefined') return
  reading.add(url)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  let settled = false
  const settle = (seconds: number | null) => {
    if (settled) return
    settled = true
    video.removeAttribute('src')
    video.load()
    reading.delete(url)
    lengths.set(url, seconds)
    for (const listener of listeners) listener()
  }
  video.addEventListener('loadedmetadata', () => settle(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null), { once: true })
  video.addEventListener('error', () => settle(null), { once: true })
  video.src = url
}

export function useVideoLength(url: string | null): number | null {
  const seconds = useSyncExternalStore(subscribe, () => (url ? lengths.get(url) ?? null : null), () => null)
  useEffect(() => {
    if (url) read(url)
  }, [url])
  return seconds
}
