// 샷 설계(static_spec)의 빛 · 초점 · 렌즈 · 색을 글로 — 실사 그림체의 실사 지시문에 싣는 시네 줄(오너 2026-11-23 "2 모두 적용을 실사 스타일로").
//   러프 손글씨(KEY · 렌즈 · FOCUS · 색온도)를 그림에 옮기지 않는 대신 같은 값을 글로 넘긴다. 만드는 법은 #viz-gap 의 renderRepaintCineLine
//   (빛 · 초점 · 렌즈 · 색만, 구도 · 자세는 안 건드림).
//   storyboard-strip 과 따로 둔 까닭: 실사 라우트 시험들이 storyboard-strip 을 통째로 가짜로 바꾼다 — 거기 두면 그 시험들에서 이 함수가 없다.
//   약속: tests/director/still-consistency.test.ts
import { renderRepaintCineLine, type FacetRenderSpec } from '@/lib/writer/facet-render'

/** 시네 줄이 말하는 값 — 하나도 없는 설계(다른 엔진의 설계 등)는 "unspecified" 같은 잡음만 남으므로 싣지 않는다. */
const SAID = ['shot_type', 'camera_angle', 'lens_mm', 'depth_of_field', 'lighting', 'framing', 'palette_emphasis', 'color_grading_intent', 'texture_notes'] as const

/** 샷 설계 → 시네 줄. 설계가 없거나 칸 모양이 이상하면 null — 설계는 모델이 쓴 글이라 목록 칸에 글자가 들어올 수 있고, 그 때문에 그림 요청이 끊기면 안 된다. */
export function realCineLine(staticSpec: unknown): string | null {
  if (!staticSpec || typeof staticSpec !== 'object' || Array.isArray(staticSpec)) return null
  const spec = staticSpec as Record<string, unknown>
  if (!SAID.some((key) => spec[key] !== null && spec[key] !== undefined)) return null
  try {
    return (
      renderRepaintCineLine(staticSpec as FacetRenderSpec)
        // 모르는 값("unspecified lens")은 말하지 않는다. 그러고 "Shot."만 남으면 그것도 뺀다.
        .replace(/, unspecified (?:angle camera angle|lens)/g, '')
        .replace(/^Shot\.\s*/, '')
        // 설계 글이 마침표로 끝나면 마침표가 겹친다("…emptiness.. Lighting") — 하나로.
        .replace(/\.{2}(?!\.)/g, '.')
        .trim() || null
    )
  } catch {
    return null
  }
}
