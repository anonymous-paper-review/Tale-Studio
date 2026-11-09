// 편집 저장본의 파형 자릿수 줄이기 (2026-11-10 검토 A E2a).
//   파형은 0~1 사이 1000칸이라 디코드한 그대로(0.8414709848078965)면 오디오 하나에 약 2만 글자 — 영상이 많은 프로젝트 몇 개면
//   브라우저 저장 공간(약 500만 글자)이 찼다. 저장할 때만 소수 둘째 자리까지로 줄인다(뜻 · 칸 수는 그대로, 예전 저장본도 그대로 읽힌다).
//   화면에 쓰는 편집 상태의 파형은 줄이지 않는다. 약속: tests/editor/save-size.test.ts
import type { AudioSource, AudioTrackClip } from '@/types'
import type { PersistedEditor } from '@/lib/editor-persistence'

// 편집할 때마다(끌기 중 포함) 저장본을 다시 만든다 — 같은 파형 배열은 한 번만 줄인다.
const compacted = new WeakMap<readonly number[], number[]>()

/** 0~1 파형 값을 소수 둘째 자리로 — 높이 72px 오디오 칸에서 1px 이 안 되는 차이다. */
export function compactPeaks(peaks: readonly number[]): number[] {
  const hit = compacted.get(peaks)
  if (hit) return hit
  const out = peaks.map((p) => Math.round(p * 100) / 100)
  compacted.set(peaks, out)
  return out
}

function withCompactPeaks<T extends AudioTrackClip | AudioSource>(item: T): T {
  const peaks = (item as { peaks?: number[] }).peaks
  return peaks?.length ? { ...item, peaks: compactPeaks(peaks) } : item
}

/** 저장할 편집 상태 — 오디오 클립 · 오디오 보관함의 파형만 줄이고 나머지는 그대로 둔다. */
export function compactSnapshot(snapshot: PersistedEditor): PersistedEditor {
  return {
    ...snapshot,
    audioClips: snapshot.audioClips.map(withCompactPeaks),
    audioSources: snapshot.audioSources.map(withCompactPeaks),
  }
}
