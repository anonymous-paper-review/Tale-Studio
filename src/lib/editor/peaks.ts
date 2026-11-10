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

// 파형은 원본 소리 파일 전체의 것이라 같은 파일을 쓰는 조각(자르기 도구로 나눈 조각 등)은 같은 파형을 쓴다.
const sourceKey = (a: AudioTrackClip) => a.blobKey ?? a.url
const samePeaks = (a: readonly number[], b: readonly number[]) => a === b || (a.length === b.length && a.every((p, i) => p === b[i]))

/**
 * 저장할 편집 상태 — 오디오 클립 · 오디오 보관함의 파형만 줄이고 나머지는 그대로 둔다.
 *   같은 소리 파일의 파형은 저장본에 한 번만 넣는다 — 나눌 때마다 약 4,900자씩 더 들던 것(2026-11-10 검토 b). 되살릴 때 sharePeaks 가 채운다.
 */
export function compactSnapshot(snapshot: PersistedEditor): PersistedEditor {
  const kept = new Map<string, number[]>()
  const audioClips = snapshot.audioClips.map((clip) => {
    const item = withCompactPeaks(clip)
    if (!item.peaks?.length) return item
    const first = kept.get(sourceKey(item))
    if (!first) {
      kept.set(sourceKey(item), item.peaks)
      return item
    }
    if (!samePeaks(first, item.peaks)) return item
    const { peaks: _shared, ...rest } = item
    return rest
  })
  return {
    ...snapshot,
    audioClips,
    audioSources: snapshot.audioSources.map(withCompactPeaks),
  }
}

/**
 * 되살린 소리 조각 중 저장본에서 파형 칸이 빠진 것(compactSnapshot 이 같은 파일이라 뺀 것)은 같은 소리 파일의 파형을 함께 쓴다.
 *   파형이 빈 칸([])인 조각은 아직 못 그린 것이라 그대로 둔다 — 열고 나서 뒤에서 채운다(검토 A E5).
 */
export function sharePeaks(audioClips: AudioTrackClip[]): AudioTrackClip[] {
  const byFile = new Map<string, number[]>()
  for (const clip of audioClips) if (clip.peaks?.length && !byFile.has(sourceKey(clip))) byFile.set(sourceKey(clip), clip.peaks)
  if (byFile.size === 0) return audioClips
  return audioClips.map((clip) => (clip.peaks !== undefined || !byFile.has(sourceKey(clip)) ? clip : { ...clip, peaks: byFile.get(sourceKey(clip)) }))
}
