// Editor 시퀀스 정보 · 시:분:초:장 — 위 둘째 줄의 "길이 · 가로×세로 · 초당 장 수"와 모든 시간 표시가 내보내기(드래프트 렌더)가
//   실제로 만드는 크기 · 장 수와 같게 한다(2단계 ① 새 배치, 시안 E1 409:4639, 2026-11-14). 순수 함수만 둔다.
//   약속: tests/editor/panels.test.ts
import { videoAspectRatioFromFormat } from '@/lib/project-aspect'
import { timelineEnd } from '@/lib/editor/timeline-segments'
import type { ProjectFormat } from '@/types/project'

/** 내보내기가 녹화하는 초당 장 수 — 시:분:초:장의 "장"도 이 값으로 센다. */
export const SEQUENCE_FPS = 30
/** 내보내기 크기의 긴 변(px). */
export const SEQUENCE_LONG_SIDE = 1280

/** 시:분:초:장 — "00:00:04:05". */
export function formatTimecode(sec: number, fps = SEQUENCE_FPS): string {
  const total = Math.max(0, sec)
  const whole = Math.floor(total + 1e-6)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const f = Math.min(fps - 1, Math.floor((total - whole) * fps + 1e-6))
  const p = (n: number) => Math.max(0, n).toString().padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`
}

/** 클립 길이 — 1분 안이면 "초:장"("04:00"), 넘으면 "분:초:장". 프로젝트 판 줄의 "V · 04:00"(시안 E1 409:4757). */
export function formatClipLength(sec: number, fps = SEQUENCE_FPS): string {
  const [h, m, s, f] = formatTimecode(sec, fps).split(':').map(Number)
  const p = (n: number) => n.toString().padStart(2, '0')
  const minutes = h * 60 + m
  return minutes > 0 ? `${minutes}:${p(s)}:${p(f)}` : `${p(s)}:${p(f)}`
}

/**
 * 내보내기 크기 — 첫 영상 비율로 긴 변 1280(2의 배수). 영상 모델은 16:9 · 9:16 · 1:1 로 만들고(시네마도 16:9), 포맷을 모르면
 *   내보내기의 기본 1280×720 이다(editor-draft-render 의 캔버스 크기 규칙과 같다).
 */
export function exportFrameSize(format: ProjectFormat | null): { width: number; height: number } {
  const ratio = videoAspectRatioFromFormat(format) ?? '16:9'
  const [w, h] = ratio.split(':').map(Number)
  const scale = SEQUENCE_LONG_SIDE / Math.max(w, h)
  const even = (n: number) => Math.round((n * scale) / 2) * 2
  return { width: even(w), height: even(h) }
}

/**
 * 시퀀스 길이(초) — 모든 영상 줄의 마지막 클립 끝(빈 곳까지 셈)과 소리 끝 가운데 늦은 쪽. 내보내기가 녹화하는 길이다.
 *   예전 화면 머리 "컷 7 · 33초 · 영상 0/7"의 "N초"를 위 둘째 줄로 옮겼다(머리는 2단계 ①에서 없앰, 리드 2026-11-14).
 *   약속: tests/editor/header-meta.test.ts
 */
export function sequenceLengthSec(
  videoLayout: ReadonlyArray<{ startSec: number; durationSec: number }>,
  audioClips: ReadonlyArray<{ startSec: number; durationSec: number }>,
): number {
  return Math.max(timelineEnd(videoLayout), audioClips.reduce((end, a) => Math.max(end, a.startSec + a.durationSec), 0))
}

/** 위 둘째 줄의 시퀀스 정보 — "00:00:33:00 · 720×1280 · 30fps". */
export function sequenceInfoLine(lengthSec: number, format: ProjectFormat | null): string {
  const { width, height } = exportFrameSize(format)
  return `${formatTimecode(lengthSec)} · ${width}×${height} · ${SEQUENCE_FPS}fps`
}
