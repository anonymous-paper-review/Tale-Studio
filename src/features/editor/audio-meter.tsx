'use client'

import { useEffect, useRef } from 'react'
import type { AudioTrackClip } from '@/types'
import { useEditorStore } from '@/stores/editor-store'

/**
 * 오디오 재생 + VU 레벨 미터 (프리미어 우측 dB 미터).
 *   - audioClips를 hidden <audio>로 재생, currentTime/isPlaying에 동기.
 *   - 전체 출력을 AnalyserNode로 모아 RMS 레벨 → 세로 dB 바.
 *   - 비디오는 muted라 오디오 트랙만 소리 남 (요청 방침).
 */
export function AudioMeter({ audioClips }: { audioClips: AudioTrackClip[] }) {
  const barRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const elsRef = useRef<Map<string, { el: HTMLAudioElement; src: MediaElementAudioSourceNode }>>(new Map())
  const rafRef = useRef<number | null>(null)

  // AudioContext + Analyser 1회 셋업
  useEffect(() => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.connect(ctx.destination)
    ctxRef.current = ctx
    analyserRef.current = analyser

    const buf = new Float32Array(analyser.fftSize)
    const loop = () => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      // RMS → 0~100% 높이 (대략 -60dB~0dB 매핑)
      const db = rms > 0 ? 20 * Math.log10(rms) : -60
      const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
      if (barRef.current) barRef.current.style.height = `${pct}%`
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      void ctx.close()
    }
  }, [])

  // audioClips 변화 → <audio> 엘리먼트 동기 (생성/제거)
  useEffect(() => {
    const ctx = ctxRef.current
    const analyser = analyserRef.current
    if (!ctx || !analyser) return
    const map = elsRef.current

    // 추가
    for (const clip of audioClips) {
      if (!map.has(clip.id)) {
        const el = new Audio(clip.url)
        el.crossOrigin = 'anonymous'
        const src = ctx.createMediaElementSource(el)
        src.connect(analyser)
        map.set(clip.id, { el, src })
      }
    }
    // 제거
    for (const [id, { el, src }] of map) {
      if (!audioClips.find((c) => c.id === id)) {
        el.pause()
        src.disconnect()
        map.delete(id)
      }
    }
  }, [audioClips])

  // 재생 상태 / playhead 동기 (store 구독)
  useEffect(() => {
    const unsub = useEditorStore.subscribe((state) => {
      const map = elsRef.current
      // 소스 미리보기 모드에서는 타임라인 오디오를 모두 정지 (프리뷰어가 단일 클립만 재생)
      if (state.previewSourceShotId) {
        for (const { el } of map.values()) if (!el.paused) el.pause()
        return
      }
      // 재생 시작 시 AudioContext 깨우기 (브라우저 autoplay 정책상 gesture 전 suspended)
      if (state.isPlaying && ctxRef.current?.state === 'suspended') {
        void ctxRef.current.resume()
      }
      for (const clip of audioClips) {
        const entry = map.get(clip.id)
        if (!entry) continue
        const local = state.currentTime - clip.startSec
        const inRange = local >= 0 && local < clip.durationSec
        // cut 된 조각은 원본의 sourceOffsetSec 부터 재생 (조각마다 다른 구간)
        const srcTime = local + (clip.sourceOffsetSec ?? 0)
        // 전역 재생 볼륨(masterVolume) 곱 — 재생 전용, draft 와 무관
        entry.el.volume = clip.muted ? 0 : clip.volume * state.masterVolume

        if (state.isPlaying && inRange) {
          if (Math.abs(entry.el.currentTime - srcTime) > 0.3) entry.el.currentTime = srcTime
          if (entry.el.paused) void entry.el.play().catch(() => {})
        } else {
          if (!entry.el.paused) entry.el.pause()
        }
      }
    })
    return unsub
  }, [audioClips])

  return (
    <div className="flex h-full w-8 shrink-0 flex-col items-center gap-1 border-l border-border bg-card py-2">
      <span className="font-mono text-[8px] text-muted-foreground">dB</span>
      <div className="relative flex-1 w-2 overflow-hidden rounded-sm bg-muted">
        <div
          ref={barRef}
          className="absolute bottom-0 w-full bg-primary transition-[height] duration-75"
          style={{ height: '0%' }}
        />
      </div>
      <span className="font-mono text-[7px] text-muted-foreground">VU</span>
    </div>
  )
}
