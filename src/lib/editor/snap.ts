// 타임라인 스냅(2단계 ③, 시안 E1 409:4795 [스냅 켬]) — 끄는 자리가 0초 · 플레이헤드 · 모든 줄 클립의 시작과 끝 · 마커에서 8px 안이면
//   그 자리에 붙는다. 영상 클립 옮기기 · 소리 옮기기 · 가장자리 끌기가 같이 쓴다. 순수 함수만 둔다.
//   약속: tests/editor/split-snap-markers.test.ts

/** 붙는 거리(px) — 화면 거리로 잰다. 확대하면 초로는 좁아진다. */
export const SNAP_PX = 8

export interface SnapInput {
  currentTime: number
  markers: readonly number[]
  /** 모든 영상 줄의 클립 자리(selectVideoLayout). */
  videoLayout: ReadonlyArray<{ shotId: string; startSec: number; durationSec: number }>
  audioClips: ReadonlyArray<{ id: string; startSec: number; durationSec: number }>
}

/** 붙을 자리 — 끄는 것(exclude: 클립 · 소리 조각 id)의 가장자리는 뺀다. */
export function snapTargets(input: SnapInput, exclude: ReadonlySet<string> = new Set()): number[] {
  const out = new Set<number>([0, input.currentTime, ...input.markers])
  for (const item of input.videoLayout) {
    if (exclude.has(item.shotId)) continue
    out.add(item.startSec)
    out.add(item.startSec + item.durationSec)
  }
  for (const a of input.audioClips) {
    if (exclude.has(a.id)) continue
    out.add(a.startSec)
    out.add(a.startSec + a.durationSec)
  }
  return [...out]
}

/** 영상 클립을 끌 때 함께 움직이는 것 — 그 클립과 이어진 소리 조각. */
export function draggedIds(shotId: string, audioClips: ReadonlyArray<{ id: string; linkedShotId?: string | null }>): string[] {
  return [shotId, ...audioClips.filter((a) => a.linkedShotId === shotId).map((a) => a.id)]
}

export interface Snapper {
  /** 한 점(가장자리)을 붙인다 — 가장 가까운 자리가 8px 안이면 그 자리, 아니면 그대로. */
  point: (sec: number) => number
  /** 길이가 있는 것(옮기는 클립)의 시작 — 시작과 끝 가운데 더 가까운 쪽이 붙는다. 0초 앞으로는 가지 않는다. */
  start: (startSec: number, durationSec: number) => number
}

/**
 * 프로젝트 판에서 끌어 놓을 때 — 스냅이 켜져 있으면 놓는 것(샷 · 소리 파일)의 시작이나 끝이 0초 · 플레이헤드 · 모든 줄 클립의 경계 ·
 *   마커에 붙는다(리드 11/14, 프리미어와 같다).
 */
export function snapDrop(input: SnapInput & { snapEnabled: boolean; pxPerSec: number }, startSec: number, durationSec: number): number {
  return makeSnapper(input.snapEnabled, snapTargets(input), input.pxPerSec).start(startSec, durationSec)
}

/** 스냅을 끄면 그대로 돌려준다. */
export function makeSnapper(enabled: boolean, targets: readonly number[], pxPerSec: number): Snapper {
  const reach = SNAP_PX / pxPerSec
  const nearest = (sec: number): { target: number; distance: number } | null => {
    let best: { target: number; distance: number } | null = null
    for (const target of targets) {
      const distance = Math.abs(sec - target)
      if (distance < reach && (!best || distance < best.distance)) best = { target, distance }
    }
    return best
  }
  return {
    point: (sec) => (enabled ? nearest(sec)?.target ?? sec : sec),
    start: (startSec, durationSec) => {
      if (!enabled) return startSec
      const head = nearest(startSec)
      const tail = nearest(startSec + durationSec)
      if (head && (!tail || head.distance <= tail.distance)) return Math.max(0, head.target)
      if (tail) return Math.max(0, tail.target - durationSec)
      return startSec
    },
  }
}
