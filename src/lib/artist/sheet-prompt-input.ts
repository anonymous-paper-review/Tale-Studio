// 인물 시트 프롬프트 입력의 단일 조립점 — generate-sheet 라우트와 서버 초안(draft-trigger)이 같은 입력을 쓴다.
//
// 왜(#ref-gate 2026-09-02): 서버 초안은 name/appearance/role 만 넣고 의상·디자인 토큰·팔레트를 뺐다.
//   프로듀서 인물의 첫 시트만 그 약한 프롬프트로 나왔고, 초안 대상을 전 인물로 넓히면서 이 차이가
//   모든 첫 시트로 번지므로 라우트의 조립 규칙을 그대로 공유한다.
import type { CharacterPromptInput } from '@/lib/artist/turnaround'
import { tokenUnlessMediaWord } from '@/lib/style-anchor'

export interface SheetDesignTokens {
  l1?: {
    art_style?: string
    shape_language?: string
    line_quality?: string
    texture_philosophy?: string
    character_proportion?: string
  }
  palette?: { primary?: string; secondary?: string; accent?: string }
}

/**
 * 그림체를 사용자가 올린 그림과 그 분석 결과가 정하는가(2026-10-10 오너) — 그러면 인물 그림 본문은 Writer 그림체 값
 *   (그림체 · 선 · 형태 · 질감 · 등신 · 색)을 싣지 않는다. Writer 값은 분석을 보지 못한 채 장르 · 그림체 이름만으로 정해져
 *   분석과 반대로 말했다(운영 806e2cc2: 6등신 · 다른 색 조합). 프리셋 · 분석이 없는 그림체는 종전 그대로.
 */
export function styleFromUserAnalysis(customStyleAnchor: unknown): boolean {
  // 프로젝트 행의 custom_style_anchor(jsonb)를 그대로 본다 — 그림 주소와 분석 결과(그림체 핵심 문장)가 다 있어야 한다.
  if (!customStyleAnchor || typeof customStyleAnchor !== 'object') return false
  const anchor = customStyleAnchor as { url?: unknown; facets?: { probe_anchors?: unknown } | null }
  const probe = anchor.facets?.probe_anchors
  return typeof anchor.url === 'string' && anchor.url.length > 0 && typeof probe === 'string' && probe.trim().length > 0
}

export function resolveCharacterPromptInput(args: {
  character: { name: string; role?: string | null }
  appearance: { appearance?: string | null; costume?: string[] | string | null }
  designTokens: SheetDesignTokens | null | undefined
  /** 스타일 앵커가 붙는가 — 붙으면 매체어를 품은 토큰만 정밀 드롭(#F-004 B4 2026-08-12). */
  hasAnchor: boolean
  /** 그림체를 올린 그림의 분석 결과가 정한다(styleFromUserAnalysis) — Writer 그림체 값을 싣지 않는다. */
  styleFromAnalysis?: boolean
}): CharacterPromptInput {
  const dt = args.designTokens ?? {}
  const palette = [dt.palette?.primary, dt.palette?.secondary, dt.palette?.accent].filter(
    (x): x is string => !!x,
  )
  const costume = args.appearance.costume
  const costumes = Array.isArray(costume)
    ? costume.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : typeof costume === 'string' && costume.trim()
      ? [costume.trim()]
      : undefined
  const pick = (value: string | undefined) => (args.hasAnchor ? tokenUnlessMediaWord(value) : value)
  const base = {
    name: args.character.name,
    appearance: args.appearance.appearance ?? args.character.name,
    role: args.character.role ?? undefined,
    costumes: costumes && costumes.length ? costumes : undefined,
  }
  // 올린 그림의 분석 결과가 그림체를 정하면 Writer 그림체 값은 싣지 않는다(2026-10-10 오너) — 그림과 분석 결과만 따른다.
  if (args.styleFromAnalysis) return { ...base, followAnchorStyle: true }
  return {
    ...base,
    // 앵커 존재 시 매체어 토큰만 정밀 드롭(#F-004 B4 2026-08-12 — 2026-07-14 통짜 억제 결정의
    //   **명시적 번복**): 옛 규칙은 art_style 을 무조건 생략했는데, 실측(dc531572)에서 억제된 것이
    //   앵커에 부합하는 유일한 토큰(3d_animation)이고 정작 매체어(texture: photorealistic)는
    //   살아남아 앵커를 이겼다 — 취지가 정확히 뒤집힌 배치. 새 규칙: 매체어를 품은 토큰만 드롭
    //   (dark_cinematic_realism 류 — 2026-07-14 실측의 교훈은 그대로 보존), 무해한 토큰은 유지.
    //   앵커 없으면 기존 그대로(no-op).
    artStyle: pick(dt.l1?.art_style),
    shapeLanguage: pick(dt.l1?.shape_language),
    lineQuality: pick(dt.l1?.line_quality),
    texturePhilosophy: pick(dt.l1?.texture_philosophy),
    characterProportion: pick(dt.l1?.character_proportion),
    palette,
  }
}
