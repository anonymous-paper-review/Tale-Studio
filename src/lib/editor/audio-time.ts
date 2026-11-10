// 소리 조각이 타임라인 초에서 재생할 원본 초 — 미리 보기(audio-meter) · 내보내기(editor-draft-render)가 같은 계산을 쓴다.
//   영상에 이어진 소리는 그 영상의 속도(playbackRate)만큼 원본에서 빨리 나아간다(오너 2026-11-10 결정 4).
//   약속: tests/editor/audio-link.test.ts
import type { AudioTrackClip } from '@/types'

export function audioSourceTime(clip: Pick<AudioTrackClip, 'startSec' | 'sourceOffsetSec' | 'playbackRate'>, timelineSec: number): number {
  return (clip.sourceOffsetSec ?? 0) + (timelineSec - clip.startSec) * (clip.playbackRate ?? 1)
}
