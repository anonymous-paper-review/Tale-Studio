// 정지 프롬프트 위생(2026-09-05, 오너 5번): 배경은 "카메라 시야 안의 표지"로 고정하고, 정지 프롬프트에서 카메라 무브 문장을 뺀다.
//   실측(겨울_6 씬 1 shot 3): 작가가 샷마다 배경 층을 새로 서술해 모델이 샷마다 환경을 다시 상상했다. 무대가 표지 좌표를 아니
//   어느 표지가 프레임 안 어느 쪽에 얼마나 멀리 있는지는 계산으로 정해진다 — 3D 전까지의 중간 단계.
import type { StageCamera, StageLandmark } from '@/lib/writer/types/pipeline'
import { project } from './geometry'

export interface LandmarkInView {
  id: string
  label: string
  side: 'left' | 'center' | 'right'
  distance: 'near' | 'mid' | 'far'
  depth_m: number
}

/** 프레임 가장자리 밖 15% 까지는 "시야 안"으로 친다 — 표지는 넓어서 가장자리에 걸쳐 보인다. */
const VIEW_MARGIN = 1.15

export function landmarksInView(camera: StageCamera, landmarks: readonly StageLandmark[], aspect: number): LandmarkInView[] {
  const out: LandmarkInView[] = []
  for (const l of landmarks) {
    const p = project(camera, { x: l.x, y: l.y, z: 1 }, aspect)
    if (!p || Math.abs(p.u) > VIEW_MARGIN) continue
    const depth = Math.hypot(l.x - camera.x, l.y - camera.y)
    out.push({
      id: l.id,
      label: l.label,
      side: p.u < -0.33 ? 'left' : p.u > 0.33 ? 'right' : 'center',
      distance: depth < 10 ? 'near' : depth < 25 ? 'mid' : 'far',
      depth_m: Math.round(depth * 10) / 10,
    })
  }
  return out.sort((a, b) => a.depth_m - b.depth_m)
}

const SIDE_WORD = { left: 'on the left', center: 'straight ahead', right: 'on the right' } as const
const DIST_WORD = { near: 'close', mid: 'in the middle distance', far: 'far away' } as const

/** 러프 셀의 배경 문장 — 표지가 시야에 없으면 null(기존 setting 문장이 남는다). */
export function backgroundClauseFromView(items: readonly LandmarkInView[]): string | null {
  if (!items.length) return null
  return `background fixed by the stage (draw exactly these, nothing else invented): ${items
    .map((i) => `${i.label} ${SIDE_WORD[i.side]}, ${DIST_WORD[i.distance]}`)
    .join('; ')}`
}

const CAMERA_LEADIN = /\b(?:as|while|when)\s+(?:the\s+)?camera\s+[^,;.]*[,;]\s*/gi
const CAMERA_SENTENCE = /(?:^|(?<=[.;!?]\s))(?:the\s+)?camera\s+[^.;!?]*[.;!?]?\s*/gi

/**
 * 정지 프롬프트에서 카메라 무브 서술을 뺀다 — 정지 그림은 프레임 안 내용만 말해야 한다. 카메라 무브는 MOTION 줄이 따로 싣는다.
 *   "As the camera pushes in, X" → "X"; "The camera tracks left." → 삭제.
 */
export function stripCameraMoveSentences(text: string): string {
  if (!text) return text
  return text
    .replace(CAMERA_LEADIN, '')
    .replace(CAMERA_SENTENCE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[,;]\s*/, '')
    .replace(/^([a-z])/, (m) => m.toUpperCase())
    .trim()
}
