// 영상 층 시각 맞추기(2단계 ⑦) — 모니터와 내보내기가 그릴 것 목록의 영상 층마다 같은 방법으로 그 시각 원본 자리에 맞춘다.
//   약속: tests/editor/frame-plan.test.ts
import type { FrameLayer } from '@/stores/editor-store'

/**
 * 영상 층을 그 시각 원본 자리에 맞춘다. 재생 중 작은 어긋남은 빠르기를 살짝 바꿔 따라잡는다 — 다시 찾으면(seek) 찾는 동안 그림이 멈추고,
 *   찾는 사이에 또 어긋난다. 0.5초 넘게 어긋나면 다시 찾는다. 멈춘 첫 장 · 끝 장은 이미 그 근처에 서 있으면 다시 찾지 않는다 — 원본 끝
 *   근처를 찾는 동안 그림이 비지 않게.
 */
export function syncLayerVideo(el: HTMLVideoElement, layer: Pick<FrameLayer, 'sourceSec' | 'held'>, speed: number, playing: boolean): void {
  const target = layer.sourceSec ?? 0
  if (playing && !layer.held) {
    if (el.paused) void el.play().catch(() => {})
    const drift = target - el.currentTime
    if (Math.abs(drift) > 0.5) el.currentTime = target
    const rate = speed * (drift > 0.04 ? 1.25 : drift < -0.04 ? 0.8 : 1)
    if (el.playbackRate !== rate) el.playbackRate = rate
  } else {
    if (!el.paused) el.pause()
    if (el.playbackRate !== speed) el.playbackRate = speed
    if (Math.abs(el.currentTime - target) > (layer.held ? 0.3 : 0.02)) el.currentTime = target
  }
}
